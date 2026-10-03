"use client";

// Stellar Wallets Kit, loaded only when someone connects, so the claim page
// stays light on a phone (PRD §14). Modules confirmed at install (PRD §10.1):
// Freighter (extension + mobile), LOBSTR, WalletConnect, xBull, plus the
// kit's other defaults.

type Kit = typeof import("@creit-tech/stellar-wallets-kit/sdk").StellarWalletsKit;

let kitPromise: Promise<Kit> | null = null;
let currentPassphrase: string | null = null;

function theme(dark: boolean) {
  // Monochrome, square, Hedvig Sans: the kit's modal follows frontend.md.
  const font = "var(--font-hedvig-sans), system-ui, arial, sans-serif";
  return dark
    ? {
        background: "#0d0d0d",
        "background-secondary": "#121212",
        "foreground-strong": "#fafafa",
        foreground: "#fafafa",
        "foreground-secondary": "#9e9e9e",
        primary: "#fafafa",
        "primary-foreground": "#18181b",
        transparent: "rgba(0,0,0,0)",
        lighter: "#1c1c1c",
        light: "#1c1c1c",
        "light-gray": "#2a2a2a",
        gray: "#9e9e9e",
        danger: "#e05252",
        border: "#242424",
        shadow: "none",
        "border-radius": "0",
        "font-family": font,
      }
    : {
        background: "#ffffff",
        "background-secondary": "#f7f6f3",
        "foreground-strong": "#121212",
        foreground: "#121212",
        "foreground-secondary": "#616161",
        primary: "#18181b",
        "primary-foreground": "#fafafa",
        transparent: "rgba(0,0,0,0)",
        lighter: "#f7f6f3",
        light: "#e6e4e0",
        "light-gray": "#dbdad7",
        gray: "#616161",
        danger: "#c42b2b",
        border: "#dbdad7",
        shadow: "none",
        "border-radius": "0",
        "font-family": font,
      };
}

export async function loadKit(passphrase: string, dark: boolean): Promise<Kit> {
  if (!kitPromise) {
    kitPromise = (async () => {
      // Modules picked one by one rather than defaultModules(): that list pulls
      // in a MetaMask adapter with an uninstalled peer dependency, and every
      // module we skip is less code on a phone.
      const [{ StellarWalletsKit }, freighter, lobstr, xbull, albedo, hana, rabet] = await Promise.all([
        import("@creit-tech/stellar-wallets-kit/sdk"),
        import("@creit-tech/stellar-wallets-kit/modules/freighter"),
        import("@creit-tech/stellar-wallets-kit/modules/lobstr"),
        import("@creit-tech/stellar-wallets-kit/modules/xbull"),
        import("@creit-tech/stellar-wallets-kit/modules/albedo"),
        import("@creit-tech/stellar-wallets-kit/modules/hana"),
        import("@creit-tech/stellar-wallets-kit/modules/rabet"),
      ]);
      const modules: import("@creit-tech/stellar-wallets-kit/types").ModuleInterface[] = [
        new freighter.FreighterModule(),
        new lobstr.LobstrModule(),
        new xbull.xBullModule(),
        new albedo.AlbedoModule(),
        new hana.HanaModule(),
        new rabet.RabetModule(),
      ];
      const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
      if (projectId) {
        const { WalletConnectModule, WalletConnectTargetChain } = await import(
          "@creit-tech/stellar-wallets-kit/modules/wallet-connect"
        );
        modules.push(
          new WalletConnectModule({
            projectId,
            metadata: {
              name: "Mora",
              description: "Payments that wait.",
              url: window.location.origin,
              icons: [`${window.location.origin}/icon.svg`],
            },
            allowedChains: [WalletConnectTargetChain.PUBLIC, WalletConnectTargetChain.TESTNET],
          }),
        );
      }
      StellarWalletsKit.init({
        modules,
        network: passphrase as never,
        theme: theme(dark),
        authModal: { showInstallLabel: true, hideUnsupportedWallets: false },
      });
      currentPassphrase = passphrase;
      return StellarWalletsKit;
    })();
  }
  const kit = await kitPromise;
  if (currentPassphrase !== passphrase) {
    kit.setNetwork(passphrase as never);
    currentPassphrase = passphrase;
  }
  kit.setTheme(theme(dark));
  return kit;
}
