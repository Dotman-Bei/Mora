#!/usr/bin/env bash
# Deploy Mora to Stellar mainnet (PRD §19 M3). Run by the owner, with the
# owner's key. No mainnet key is ever stored in this repository or on a server
# (PRD §4.4, §22.5).
#
#   1. stellar keys add mora-mainnet --secret-key     (or use a hardware wallet / --sign-with-lab)
#   2. Fund it with ~25 XLM (deploy + instance rent + contract code rent).
#   3. ./scripts/deploy-mainnet.sh mora-mainnet https://mainnet.sorobanrpc.com
#
# It builds the exact wasm deployed on testnet, checks its hash, deploys with
# the measured parameters, reads config() back, and writes the contract ID to
# deployments/mainnet.json.
set -euo pipefail

SOURCE="${1:?usage: deploy-mainnet.sh <stellar key name> <rpc url>}"
RPC="${2:?usage: deploy-mainnet.sh <stellar key name> <rpc url>}"
PASSPHRASE="Public Global Stellar Network ; September 2015"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WASM="$ROOT/contracts/target/wasm32v1-none/release/mora.wasm"
EXPECTED=$(python -c "import json;print(json.load(open('$ROOT/deployments/mainnet.json'))['mora']['wasmSha256'])")
GRACE=$(python -c "import json;print(json.load(open('$ROOT/deployments/mainnet.json'))['mora']['constructor']['grace_ledgers'])")
MAX_ITEMS=$(python -c "import json;print(json.load(open('$ROOT/deployments/mainnet.json'))['mora']['constructor']['max_items'])")

echo "Building contracts…"
(cd "$ROOT/contracts" && stellar contract build --package mora >/dev/null)
ACTUAL=$(sha256sum "$WASM" | cut -d' ' -f1)
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "wasm hash $ACTUAL doesn't match the testnet-verified $EXPECTED. Stop." >&2
  exit 1
fi

stellar network add mora-mainnet --rpc-url "$RPC" --network-passphrase "$PASSPHRASE" 2>/dev/null || true

echo "Deploying Mora (grace_ledgers=$GRACE, max_items=$MAX_ITEMS) from $(stellar keys address "$SOURCE")…"
ID=$(stellar contract deploy --wasm "$WASM" --source "$SOURCE" --network mora-mainnet -- \
  --grace_ledgers "$GRACE" --max_items "$MAX_ITEMS" | tail -1)
echo "Contract: $ID"

echo "Reading config() back…"
stellar contract invoke --id "$ID" --source "$SOURCE" --network mora-mainnet --send=no -- config

python - "$ROOT/deployments/mainnet.json" "$ID" "$(stellar keys address "$SOURCE")" <<'PY'
import json, sys, datetime
path, cid, deployer = sys.argv[1:4]
d = json.load(open(path))
d["deployed"] = True
d["deployedAt"] = datetime.date.today().isoformat()
d["mora"]["contractId"] = cid
d["mora"]["deployer"] = deployer
json.dump(d, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
echo "Wrote deployments/mainnet.json. Set NEXT_PUBLIC_MAINNET_RPC_URLS and redeploy the app."
