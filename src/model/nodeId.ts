export type NodeId = string;

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 6;

export function generateNodeId(
  takenIds: ReadonlySet<NodeId>,
  random: () => number = Math.random,
): NodeId {
  let candidate = randomIdCandidate(random);
  while (takenIds.has(candidate)) {
    candidate = randomIdCandidate(random);
  }
  return candidate;
}

function randomIdCandidate(random: () => number): NodeId {
  let candidate = "";
  for (let i = 0; i < ID_LENGTH; i++) {
    candidate += ID_ALPHABET.charAt(Math.floor(random() * ID_ALPHABET.length));
  }
  return candidate;
}
