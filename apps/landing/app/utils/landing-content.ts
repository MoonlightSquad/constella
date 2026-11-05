type Translate = (key: string) => string;
type HasKey = (key: string) => boolean;

export type NamedText = { name: string; text: string };
export type HowStep = NamedText & { num: string };

/**
 * Рахунок береться з `te`, а не з літералу в шаблоні: питання й кроки живуть у чотирьох
 * JSON, тож сьоме питання — це один рядок у перекладах, а не правка `.vue`. Обмежувач
 * тримає перебір на випадок fallback-мови, де `te` правдивий і для відсутнього ключа.
 */
const KEY_CAP = 24;

export const faqItems = (t: Translate, te: HasKey): NamedText[] => {
  const items: NamedText[] = [];
  for (let n = 1; n <= KEY_CAP && te(`landing.faq.q${n}`); n += 1) {
    items.push({ name: t(`landing.faq.q${n}`), text: t(`landing.faq.a${n}`) });
  }
  return items;
};

export const howSteps = (t: Translate, te: HasKey): HowStep[] => {
  const steps: HowStep[] = [];
  for (let n = 1; n <= KEY_CAP && te(`landing.how.step${n}Title`); n += 1) {
    steps.push({ num: t(`landing.how.step${n}Num`), name: t(`landing.how.step${n}Title`), text: t(`landing.how.step${n}Desc`) });
  }
  return steps;
};
