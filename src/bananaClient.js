// Talks to the Banana API (a different system on the internet).
// We send an HTTPS request and get JSON back like:
//   { "question": "<link to puzzle image>", "solution": 9 }
const BANANA_URL = process.env.BANANA_URL || 'https://marcconrad.com/uob/banana/api.php';

async function fetchPuzzle() {
  // give up after 8 seconds so the game does not hang if the API is slow
  const res = await fetch(BANANA_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error('Banana API returned status ' + res.status);
  }

  const data = await res.json();

  // check the data before using it, we can't assume another system always sends the right thing
  const solution = Number(data.solution);
  if (typeof data.question !== 'string' || !Number.isInteger(solution)) {
    throw new Error('Unexpected data from Banana API');
  }

  return { image: data.question, solution: solution };
}

module.exports = { fetchPuzzle };
