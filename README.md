# Remix.fun

Launch a Solana memecoin as a remix of another. The parent is written into the launch transaction, so every coin's family tree is public and permanent.

- Static site, no backend: `index.html` + `remix-core.js` (@solana/web3.js from jsDelivr).
- One launch transaction: create mint, Metaplex metadata, creator token account, mint full supply, revoke mint authority, lineage memo.
- Registry: every launch tags `BHbtWD3Vn8hgVCwsPg6UQB7EDrk35fupshMuMy4Qg3vu` read-only, so `getSignaturesForAddress` returns the full launch log with memos.
- Market data from DexScreener. RPC defaults to publicnode; override with `?rpc=<url>`, use `?devnet` for devnet.
