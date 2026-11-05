from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

from ai.assistant.app.generator import InvalidSuggestions, parse_suggestions, validate_topic, generate_suggestions
from ai.assistant.app.settings import Settings


class ProviderResponse:
    def __init__(self, value: dict):
        self.value = value

    def __enter__(self) -> "ProviderResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self, _limit: int) -> bytes:
        return json.dumps(self.value).encode()


class AssistantGeneratorTests(unittest.TestCase):
    def test_topic_rejects_contact_details(self) -> None:
        for topic in ("name@example.com", "https://example.com", "+380 50 123 4567"):
            with self.subTest(topic=topic), self.assertRaises(ValueError):
                validate_topic(topic)

    def test_response_requires_three_bounded_suggestions(self) -> None:
        self.assertEqual(len(parse_suggestions('{"suggestions":["first idea","second idea","third idea"]}')), 3)
        with self.assertRaises(InvalidSuggestions):
            parse_suggestions('{"suggestions":["one"]}')

    @patch("ai.assistant.app.generator.urllib.request.urlopen")
    def test_provider_receives_only_topic_and_locale_context(self, urlopen: MagicMock) -> None:
        suggestions = ["A thoughtful question?", "A playful question?", "A curious question?"]
        urlopen.return_value = ProviderResponse({
            "choices": [{"message": {"content": json.dumps({"suggestions": suggestions})}}]
        })
        settings = Settings(
            internal_token="x" * 32,
            provider_url="http://model:11434/v1/chat/completions",
            provider_model="local-model",
            provider_api_key="test-provider-key",
            provider_timeout_ms=20_000,
            queue_timeout_ms=1_000,
            max_body_bytes=2_048,
        )

        result = generate_suggestions(settings, "en", "Travel")

        self.assertEqual(result, suggestions)
        request = urlopen.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.get_header("Authorization"), "Bearer test-provider-key")
        self.assertEqual(json.loads(payload["messages"][1]["content"]), {"topic": "Travel"})
        self.assertNotIn("matchId", payload["messages"][1]["content"])
        self.assertNotIn("history", payload["messages"][1]["content"])


if __name__ == "__main__":
    unittest.main()
