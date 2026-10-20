// Everything a human needs to edit before submitting. Placeholders are marked YOUR-… and get a visible "add me" state in the UI.
export const SITE = {
  name: 'Plica',
  hackathon: 'Hackathon 2026',
  links: {
    github: 'https://github.com/YOUR-ORG/plica',
    install: 'https://github.com/YOUR-ORG/plica#install-the-extension',
    demoVideoEmbed: 'https://www.youtube.com/embed/YOUR_VIDEO_ID',
    demoVideoWatch: 'https://youtu.be/YOUR_VIDEO_ID',
    guide: 'https://YOUR-DOC-LINK.example/plica-product-technical-guide',
    deck: '',
  },
  chain: {
    name: 'Base Sepolia',
    deployed: false, // flip to true once the contracts below are live
    explorerAddress: 'https://sepolia.basescan.org/address/',
    contracts: [
      { name: 'ProvenanceRegistry', address: '0x0000000000000000000000000000000000000000', purpose: 'Anchors receipts' },
      { name: 'MemoryVault', address: '0x0000000000000000000000000000000000000000', purpose: 'Merkle root, scopes, tombstones, panic revoke' },
    ],
  },
  team: [
    { name: 'Dakshesh', role: 'Builder' },
    { name: 'Teammate name', role: 'Role' },
    { name: 'Teammate name', role: 'Role' },
  ],
};
export const isPlaceholder = (u: string) => !u || /YOUR[-_]/i.test(u);
