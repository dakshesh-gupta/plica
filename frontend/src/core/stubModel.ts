/**
 * Demo model. A canned, deterministic stand-in so the demo works offline with no API keys.
 * It is labelled "Demo model, not a real AI provider" everywhere it appears.
 */
export const DEMO_MODEL_NAME = 'Demo model (not a real AI provider)';

export function stubAnswer(fullPrompt: string): string {
  const memBlock = /\[Plica memory context[^\]]*\]([\s\S]*?)\[End Plica memory context\]/.exec(fullPrompt)?.[1] ?? '';
  const prompt = fullPrompt.replace(/\[Plica memory context[\s\S]*?\[End Plica memory context\]\s*/, '').trim();
  const mem = memBlock.toLowerCase();
  const short = /short|brief|concise/.test(mem);
  const veg = /vegetarian|vegan/.test(mem);
  const noMush = /mushroom/.test(mem);
  const projectX = /project x/i.test(memBlock);
  const isFood = /dinner|lunch|meal|recipe|cook|eat|food/i.test(prompt);
  const isWork = /project|work|focus|plan|today|sprint|status/i.test(prompt);

  if (isFood) {
    const base = veg
      ? ['Since you’re vegetarian, here are three dinners:', '1. Chickpea and spinach curry with jeera rice', '2. Paneer tikka wraps with mint chutney', noMush ? '3. Stuffed bell peppers with quinoa (no mushrooms)' : '3. Creamy mushroom stroganoff over pasta']
      : ['Here are three dinner ideas:', '1. Lemon-garlic chicken with roasted vegetables', '2. Spaghetti bolognese with a side salad', '3. Grilled fish tacos with slaw'];
    return short ? base.join('\n') : base.concat(['', 'Want a shopping list or a 20-minute version of any of these?']).join('\n');
  }
  if (isWork) {
    const lines = projectX
      ? ['For Project X today:', '1. Close the open review comments first.', '2. Block 90 minutes for the next milestone.', '3. Send a two-line status update before 5 pm.']
      : ['A simple plan for today:', '1. Pick the single most important task.', '2. Block 90 minutes of focus time.', '3. Send a short status update at the end of the day.'];
    return short ? lines.join('\n') : lines.concat(['', 'Tell me the deadline and I will tighten this into a schedule.']).join('\n');
  }
  return short ? 'Here is a short answer: it depends on your goal. Tell me more and I will be specific.' : 'Happy to help with that. Could you share a little more about what you are aiming for, so I can give a specific answer?';
}

export async function stubModelRespond(fullPrompt: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 900));
  return stubAnswer(fullPrompt);
}
