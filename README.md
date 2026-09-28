# Remix.fun

Launch a Solana memecoin as a remix of another. The parent is written into the launch transaction, so every coin's family tree is public and permanent.

- Static site, no backend: `index.html` + `remix-core.js` (@solana/web3.js from jsDelivr).
- One launch transaction: create mint, Metaplex metadata, creator token account, mint full supply, revoke mint authority, lineage memo.
- Registry: every launch tags `BHbtWD3Vn8hgVCwsPg6UQB7EDrk35fupshMuMy4Qg3vu` read-only, so `getSignaturesForAddress` returns the full launch log with memos.
- Market data from DexScreener. RPC defaults to publicnode; override with `?rpc=<url>`, use `?devnet` for devnet.

## Security
- Strict Content-Security-Policy: scripts only from this origin, no inline script or handlers; network only to the RPC and DexScreener.
- Solana library self-hosted (`vendor/`) with a Subresource Integrity hash; no third-party scripts (analytics is a plain pixel).
- Every launch transaction is checked before and after wallet signing (`checkLaunchTx`): exact program list, no extra signers, no SOL leaving the wallet beyond mint rent. A wallet that returns a different transaction is refused.
- Registry entries are only shown if their own transaction initialized that mint (`verifyLaunch`), so spam memos and false "remix of" claims are ignored.
- Names are stripped of zero-width and bidi characters; remixes reusing a major ticker are flagged. All untrusted text is HTML-escaped and URLs are allowlisted.
- Fixed RPC endpoints (no URL override), frame-busting against clickjacking, HTTPS enforced.
