"""Lance l'API ReelBroker sur 127.0.0.1 (port 8000 par défaut ; le serveur Vite redirige /api vers 8000)."""
import argparse
import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Lance l'API ReelBroker sur 127.0.0.1.")
    parser.add_argument("--port", type=int, default=8000, help="port d'écoute (défaut : 8000)")
    args = parser.parse_args()

    from alphaforge import agents

    agents.load_env(Path(__file__).resolve().parent.parent / ".env")  # identifiants Bedrock, jamais affichés
    uvicorn.run("alphaforge.api:app", host="127.0.0.1", port=args.port, log_level="info")
