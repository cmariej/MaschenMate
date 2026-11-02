import type { Needle, Yarn } from './project.service';
import { compareNames } from './name-sort';

export interface MaterialOption<T> {
  key: string;
  item: T;
  selected: boolean;
}

function yarnDetails(yarn: Yarn): string {
  const text = (value: string | undefined) => (value ?? '').trim().toLocaleLowerCase('de-DE');
  return JSON.stringify([
    text(yarn.name), text(yarn.brand), text(yarn.color), text(yarn.colorCode),
    yarn.needleSize, yarn.length, yarn.weight,
    (yarn.composition ?? []).map((part) => [text(part.material), part.percentage]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  ]);
}

function options<T extends { id: string }>(selected: T[], library: T[], sameDetails: (left: T, right: T) => boolean): MaterialOption<T>[] {
  const remaining = [...library];
  const result: MaterialOption<T>[] = [];
  for (const item of selected) {
    let match = remaining.findIndex((candidate) => candidate.id === item.id && sameDetails(candidate, item));
    if (match < 0) match = remaining.findIndex((candidate) => sameDetails(candidate, item));
    if (match >= 0) remaining.splice(match, 1);
    result.push({ key: `project-${item.id}`, item, selected: true });
  }
  result.push(...remaining.map((item) => ({ key: `library-${item.id}`, item, selected: false })));
  return result;
}

export function yarnOptions(selected: Yarn[], library: Yarn[]): MaterialOption<Yarn>[] {
  return options(selected, library, (left, right) => yarnDetails(left) === yarnDetails(right))
    .sort((left, right) => compareNames(left.item.name, right.item.name) || compareNames(left.item.brand, right.item.brand) || compareNames(left.item.color, right.item.color));
}

export function needleOptions(selected: Needle[], library: Needle[], label: (needle: Needle) => string): MaterialOption<Needle>[] {
  return options(selected, library, (left, right) => left.type === right.type && left.size === right.size)
    .sort((left, right) => compareNames(label(left.item), label(right.item)));
}
