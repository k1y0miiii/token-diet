"""token-diet — put your LLM payloads on a token diet.

Reproducibly benchmark how many tokens the SAME data costs in different
encodings (JSON, minified JSON, short keys, JTF, CSV/TSV, YAML), measured for
real with tiktoken. No invented numbers.
"""

__version__ = "0.1.0"

from token_diet.encoders import ENCODERS  # noqa: E402,F401
from token_diet.tokenizers import count_tokens  # noqa: E402,F401
