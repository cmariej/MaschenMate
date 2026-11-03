export function repeatRowLabel(index: number): string {
  let letters = '';
  for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) {
    letters = String.fromCharCode(65 + (number - 1) % 26) + letters;
  }
  return `Reihe ${letters}`;
}
