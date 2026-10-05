// A stand-in for the Freighter browser extension, for end-to-end tests only.
// It answers the same window.postMessage protocol the real extension does
// (@stellar/freighter-api 6), so the site runs its real production code path.
// Keys are throwaway testnet keypairs held by the test process; the page only
// ever sees public keys and signed XDR.
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";

/** Install the fake extension on a Playwright page. `wallet.use(name)` switches account. */
export async function installFakeFreighter(page, keys) {
  const wallet = {
    current: Object.keys(keys)[0],
    use(name) {
      this.current = name;
    },
    get publicKey() {
      return keys[this.current].publicKey();
    },
  };

  await page.exposeFunction("__fakeFreighter", async (msg) => {
    const kp = keys[wallet.current];
    switch (msg.type) {
      case "REQUEST_CONNECTION_STATUS":
        return { isConnected: true };
      case "REQUEST_ALLOWED_STATUS":
      case "SET_ALLOWED_STATUS":
        return { isAllowed: true };
      case "REQUEST_ACCESS":
      case "REQUEST_PUBLIC_KEY":
        return { publicKey: kp.publicKey() };
      case "REQUEST_NETWORK":
      case "REQUEST_NETWORK_DETAILS":
        return {
          network: "TESTNET",
          networkPassphrase: Networks.TESTNET,
          networkDetails: {
            network: "TESTNET",
            networkName: "Test Net",
            networkUrl: "https://horizon-testnet.stellar.org",
            networkPassphrase: Networks.TESTNET,
            sorobanRpcUrl: "https://soroban-testnet.stellar.org",
          },
        };
      case "SUBMIT_TRANSACTION": {
        const tx = TransactionBuilder.fromXDR(msg.transactionXdr, msg.networkPassphrase ?? Networks.TESTNET);
        tx.sign(kp);
        return { signedTransaction: tx.toXDR(), signerAddress: kp.publicKey() };
      }
      default:
        return { apiError: { code: -1, message: `fake freighter: ${msg.type} not supported` } };
    }
  });

  await page.addInitScript(() => {
    window.addEventListener("message", async (e) => {
      if (e.source !== window || e.data?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;
      const { messageId, source: _s, ...msg } = e.data;
      const reply = await window.__fakeFreighter(msg);
      // The real extension echoes the id as `messagedId` (sic).
      window.postMessage({ source: "FREIGHTER_EXTERNAL_MSG_RESPONSE", messagedId: messageId, ...reply }, window.location.origin);
    });
  });

  return wallet;
}

export function freshKeys(names) {
  return Object.fromEntries(names.map((n) => [n, Keypair.random()]));
}
