import os
import json

class Config:
    def __init__(self):
        base_path = os.path.dirname(os.path.abspath(__file__))

        self.questions_path = os.path.join(base_path, "questions.json")
        self.tone_matrix_path = os.path.join(base_path, "tone.json")
        self.rules_path = os.path.join(base_path, "rules.json")  

        self.questions = self._load_json(self.questions_path)
        self.tone_matrix = self._load_json(self.tone_matrix_path)
        self.rules = self._load_json(self.rules_path)

    def _load_json(self, path):
        if not os.path.exists(path):
            raise FileNotFoundError(f"Missing config file: {path}")
        with open(path, 'r') as f:
            return json.load(f)


# Expose a shared instance of the config
config = Config()
