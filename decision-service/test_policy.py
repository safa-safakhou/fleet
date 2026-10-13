import unittest
from server import predict, example, POLICY


def request(history=None, context=None):
    return {"policy": POLICY, "features": context or {"shortage": 1},
            "choices": ["development", "resilience"], "history": history or []}


class PolicyTest(unittest.TestCase):
    def test_untrained_is_uniform_and_replay_is_deterministic(self):
        self.assertEqual(predict(request())["probabilities"], [0.5, 0.5])
        h = [{"features": {"shortage": 1}, "choices": ["development", "resilience"],
              "chosen": i % 2, "probability": 0.5, "reward": 1 if i % 2 else -1} for i in range(120)]
        a, b = predict(request(h)), predict(request(h))
        self.assertEqual(a, b)
        self.assertEqual(a["trained"], 120)
        self.assertGreater(a["probabilities"][1], 0.8)

    def test_learns_different_preferences_in_different_contexts(self):
        h = []
        for i in range(200):
            for shortage in [0, 1]:
                chosen = i % 2
                h.append({"features": {"shortage": shortage, "abundance": 1-shortage},
                          "choices": ["development", "resilience"], "chosen": chosen,
                          "probability": 0.5, "reward": 1 if chosen == shortage else -1})
        for shortage in [0, 1]:
            p = predict(request(h, {"shortage": shortage, "abundance": 1-shortage}))["probabilities"]
            self.assertGreater(p[shortage], 0.8)
            self.assertGreater(min(p), 0)
            self.assertAlmostEqual(sum(p), 1)

    def test_validation_rejects_injection_bad_propensity_and_unknown_actions(self):
        for invalid in [{"features": {"x\n|a injected": 1}}, {"choices": ["shell"]}, {"features": {"x": float("nan")}}, {"choices": ["trade", "trade"]}]:
            body = request() | invalid
            with self.assertRaises(ValueError):
                predict(body)
        for propensity in [0, -1, float("nan"), 1.01]:
            row = {"features": {"x": 1}, "choices": ["trade"], "chosen": 0, "probability": propensity, "reward": 1}
            with self.assertRaises(ValueError):
                example(row, True)
        with self.assertRaises(ValueError):
            predict(request() | {"policy": "unknown"})
        with self.assertRaises(ValueError):
            predict(request([{}] * 2001))

    def test_full_replay_window_and_zero_feedback_do_not_create_a_tie_bias(self):
        h = [{"features": {f"f{j}": j / 40 for j in range(40)}, "choices": ["development", "resilience"],
              "chosen": i % 2, "probability": 0.5, "reward": 0} for i in range(2000)]
        result = predict(request(h))
        self.assertEqual(result["trained"], 2000)
        self.assertEqual(result["probabilities"], [0.5, 0.5])


if __name__ == "__main__":
    unittest.main()
