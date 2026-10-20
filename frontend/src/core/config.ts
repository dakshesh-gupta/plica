/**
 * Site-wide configuration. Everything a team member needs to edit before
 * submitting lives here: links, contract addresses, team, anchoring mode.
 */
export const SITE = {
  name: 'Plica',
  tagline: 'Every AI answer comes with a receipt: what it remembered about you.',
  version: '0.1.0',

  /** TODO: replace with the real URLs before submitting. */
  links: {
    github: 'https://github.com/your-team/plica',
    demoVideo: '', // e.g. https://www.youtube.com/watch?v=XXXXXXXXXXX  (leave empty to show a placeholder)
    guide: './Plica_Product_Technical_Guide.pdf',
    pitchDeck: '',
  },

  team: [
    { name: 'Dakshesh', role: 'Team Plica' },
    // { name: 'Teammate', role: 'Smart contracts' },
  ],

  /**
   * Anchoring. "simulated" = the in-browser registry used by the demo and the
   * Verify page. Switch to "testnet" once ProvenanceRegistry / MemoryVault are
   * deployed and fill in the addresses below.
   */
  anchoring: {
    mode: 'simulated' as 'simulated' | 'testnet',
    chain: 'Base Sepolia',
    explorerTx: 'https://sepolia.basescan.org/tx/',
    explorerAddress: 'https://sepolia.basescan.org/address/',
    contracts: {
      ProvenanceRegistry: '0x0000000000000000000000000000000000000000',
      MemoryVault: '0x0000000000000000000000000000000000000000',
    },
  },
};

export const LIMITS_SENTENCE =
  'This proves Plica will not supply the memory again. It does not erase copies already sent to the chat provider or held in its chat history or its own memory feature. Switch off the provider’s built-in memory.';

export const SIGNATURE_SENTENCE = 'A signature proves who signed, not that the content is true.';

export const DEMO_MODEL_LABEL = 'Demo model, not a real AI provider';
