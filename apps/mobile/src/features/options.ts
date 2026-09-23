import { finishLabels, finishes } from "@mooligan/domain/catalog";
import {
  cardConditionLabels,
  cardConditions,
  cardLanguageLabels,
  cardLanguages,
} from "@mooligan/domain/collection";
import { deckSectionLabels, deckSections } from "@mooligan/domain/decks";

export const finishOptions = finishes.map((value) => ({ value, label: finishLabels[value] }));
export const cardLanguageOptions = cardLanguages.map((value) => ({
  value,
  label: cardLanguageLabels[value],
}));
export const cardConditionOptions = cardConditions.map((value) => ({
  value,
  label: cardConditionLabels[value],
}));
export const deckSectionOptions = deckSections.map((value) => ({
  value,
  label: deckSectionLabels[value],
}));
