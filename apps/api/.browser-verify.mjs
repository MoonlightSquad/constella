// Temporary browser verification for the admin console. Read-only against the shared DB:
// every page is rendered, only the dryRun broadcast is exercised, children are killed at the end.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const { db, users } = await import('@constella/db');
const { desc, isNull, and, sql } = await import('drizzle-orm');

const CONSOLE = 'http://127.0.0.1:3000';
const API = 'http://127.0.0.1:4000';
const SHOTS = '/tmp/admin-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET missing');

const [subject] = await db.select({ id: users.id, name: users.displayName, sessionVersion: users.sessionVersion })
  .from(users).where(and(isNull(users.bannedAt)))
  .orderBy(desc(sql`(select count(*) from messages m where m.sender_id = "users"."id")`)).limit(1);
if (!subject) throw new Error('no subject user');
console.log('subject:', subject.id, subject.name, 'sessionVersion', subject.sessionVersion);

const b64 = (value) => Buffer.from(value).toString('base64url');
const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = b64(JSON.stringify({
  id: subject.id, telegramId: null, authProvider: 'web', sessionVersion: subject.sessionVersion,
  exp: Math.floor(Date.now() / 1000) + 3600,
}));
const token = `${header}.${payload}.${crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`;
const csrf = crypto.randomBytes(16).toString('hex');

const auditCount = async () => (await db.execute(sql`select count(*)::int as n from admin_audit_logs`))[0].n;
const before = await auditCount();

const children = [];
const start = (name, cwd, file, env) => {
  const out = fs.openSync(`/tmp/admin-shots/${name}.log`, 'w');
  const child = spawn(process.execPath, [file], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', out, out],
  });
  children.push(child);
  return child;
};

start('api', process.cwd(), 'dist/index.js', { BOT_TOKEN: '123:dummy', VERCEL: '1', ADMIN_USER_IDS: subject.id, PORT: '4000' });
start('console', resolve(process.cwd(), '../admin'), '.output/server/index.mjs', {
  NUXT_API_INTERNAL_BASE: API, PORT: '3000', HOST: '127.0.0.1', NODE_ENV: 'production',
});

const waitUp = async (url, label) => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      // The API answers 401 for an unauthenticated tRPC call; both prove the process is listening.
      if (response.status === 200 || response.status === 401) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`${label} did not come up — see /tmp/admin-shots`);
};
await waitUp(`${API}/trpc/admin.overview`, 'api');
await waitUp(`${CONSOLE}/`, 'console');

const browser = await chromium.launch();
const report = [];
try {
  // Without the session cookie the console must bounce to /login.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`${CONSOLE}/`, { waitUntil: 'networkidle' });
  report.push({ check: 'anonymous redirect', value: anonPage.url() });
  await anonPage.screenshot({ path: `${SHOTS}/login.png`, fullPage: true });
  report.push({
    check: 'login form',
    h1: await anonPage.locator('h1').first().textContent(),
    width: await anonPage.locator('.adm__login').evaluate((el) => Math.round(el.getBoundingClientRect().width)),
    buttonHeight: await anonPage.locator('.adm__login .adm__btn').evaluate((el) => Math.round(el.getBoundingClientRect().height)),
  });
  await anon.close();

  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.addCookies([
    { name: 'constella_admin', value: token, domain: '127.0.0.1', path: '/api', httpOnly: true, secure: false, sameSite: 'Lax' },
    { name: 'constella_csrf', value: csrf, domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  const noise = [];
  page.on('console', (message) => { if (message.type() === 'error') noise.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => noise.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => noise.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));

  const PAGES = [
    { path: '/', expect: { '.adm__card': 5 } },
    { path: '/users', expect: { '.adm__table tbody tr': 1 } },
    { path: `/users/${subject.id}`, expect: { '.adm__panel': 4, '.adm__table tbody tr': 1 } },
    { path: '/reports', expect: {} },
    { path: '/photos', expect: {} },
    { path: '/payments', expect: {} },
    { path: '/support', expect: { '.adm__support, .adm__muted': 1 } },
    { path: '/audit', expect: { '.adm__entry, .adm__table tbody tr': 1 } },
    { path: '/blog', expect: { '.adm__note, .adm__panel, table': 1 } },
    { path: '/blog/new', expect: { '.adm__panel': 1, 'input[type=url], textarea, input[type=text]': 3 } },
    { path: '/growth', expect: { '.adm__meter__bar': 5, '.adm__grid--cards .adm__card': 6 } },
  ];

  for (const target of PAGES) {
    await page.goto(`${CONSOLE}${target.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const errors = await page.locator('.adm__error').allTextContents();
    const counts = {};
    for (const selector of Object.keys(target.expect)) counts[selector] = await page.locator(selector).count();
    const shot = `${SHOTS}${target.path.replace(/\//g, '_') || '_home'}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    report.push({ page: target.path, errors, counts, h1: await page.locator('h1').first().textContent(), shot });
  }

  // The growth page: 30 daily bars, heights scaled to the peak.
  await page.goto(`${CONSOLE}/growth`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const selects = await page.locator('select').count();
  const bars = await page.locator('.adm__spark__bar').count();
  const heights = await page.locator('.adm__spark__bar').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  report.push({
    check: 'growth series', selects, bars,
    nonZeroHeights: heights.filter((h) => h > 1).length, max: Math.max(...heights),
    funnelHints: await page.locator('.adm__panel').filter({ hasText: 'Воронка' }).locator('.adm__hint').allTextContents(),
  });

  // The only action that writes nothing.
  await page.fill('#push-title', 'Browser check');
  await page.fill('#push-body', 'Перевірка інтерфейсу, нічого не надсилається.');
  const dryDefault = await page.isChecked('#push-dry-run');
  const dryButton = page.getByRole('button', { name: 'Перевірити без відправки' });
  const sendDisabled = await dryButton.isDisabled();
  await dryButton.click();
  await page.waitForSelector('.adm__note', { timeout: 20_000 });
  report.push({
    check: 'dry run broadcast', dryDefaultChecked: dryDefault, wasDisabled: sendDisabled,
    note: (await page.locator('.adm__note').first().textContent())?.trim(),
    auditAfterDryRun: await auditCount(),
  });
  await page.screenshot({ path: `${SHOTS}/growth_dryrun.png`, fullPage: true });

  await page.goto(`${CONSOLE}/users/${subject.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const birth = await page.locator('p').filter({ hasText: 'Народження' }).first().textContent();
  report.push({ check: 'dossier birthdate', text: birth?.trim() });

  // Redesign checks: the mega menu and the table scroll at three widths.
  const menuShot = async (width, height, name) => {
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.addCookies([
      { name: 'constella_admin', value: token, domain: '127.0.0.1', path: '/api', httpOnly: true, secure: false, sameSite: 'Lax' },
      { name: 'constella_csrf', value: csrf, domain: '127.0.0.1', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' },
    ]);
    const p = await ctx.newPage();
    await p.goto(`${CONSOLE}/users`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
    const noPageScroll = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const tableScroll = await p.evaluate(() => {
      const el = document.querySelector('.adm__panel');
      return el ? { client: el.clientWidth, scroll: el.scrollWidth } : null;
    });
    const actionsHeight = await p.locator('.adm__actions').first().evaluate((el) => Math.round(el.getBoundingClientRect().height));
    await p.screenshot({ path: `${SHOTS}/${name}-users.png`, fullPage: true });

    await p.click('.adm__menu');
    await p.waitForSelector('.adm__mega');
    await p.waitForTimeout(300);
    const expanded = await p.getAttribute('.adm__menu', 'aria-expanded');
    const current = await p.locator('.adm__mega__link[aria-current="page"] strong').first().textContent();
    const mainInert = await p.locator('#adm-main').evaluate((el) => el.hasAttribute('inert'));
    const menuFits = await p.evaluate(() => {
      const el = document.querySelector('.adm__mega');
      return el ? el.scrollHeight <= el.clientHeight + 1 : null;
    });
    await p.screenshot({ path: `${SHOTS}/${name}-menu.png` });

    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    const closed = await p.locator('.adm__mega').count();
    const focused = await p.evaluate(() => document.activeElement?.className ?? '');
    report.push({ check: `responsive ${name}`, noPageScroll, tableScroll, actionsHeight, expanded, current: current?.trim(), mainInert, menuFits, closedCount: closed, focused });
    await ctx.close();
  };
  await menuShot(1440, 1000, 'desk');
  await menuShot(1024, 900, 'mid');
  await menuShot(390, 844, 'phone');

  report.push({ check: 'noise', noise });
} finally {
  await browser.close().catch(() => {});
  for (const child of children) child.kill('SIGTERM');
  await new Promise((done) => setTimeout(done, 800));
  for (const child of children) child.kill('SIGKILL');
}

const after = await auditCount();
report.push({ check: 'audit rows', before, after });
console.log(JSON.stringify(report, null, 2));
process.exit(0);
