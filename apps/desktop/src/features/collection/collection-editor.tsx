import type { CatalogCardDetail } from "@mooligan/domain/catalog-detail";
import {
  CardLanguageSchema,
  cardConditionLabels,
  cardConditions,
  cardLanguageLabels,
  cardLanguages,
  type CardCondition,
  type CardLanguage,
} from "@mooligan/domain/collection";
import type { CollectionMutationResult } from "@mooligan/workspace/collection-contract";
import { finishLabels, type Finish } from "@mooligan/domain/catalog";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog";
import { Field, FieldLabel } from "../../components/ui/field";
import { Form } from "../../components/ui/form";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../../components/ui/number-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { colors } from "../../styles/tokens.stylex.js";
import { useCollectionMutations } from "./use-collection-mutations";

export type CollectionFormValue = {
  condition: CardCondition;
  finish: Finish;
  language: CardLanguage;
  quantity: number;
};

type CollectionFormDialogProps = {
  availableFinishes: readonly Finish[];
  cardName: string;
  finishLocked?: boolean;
  initial: Partial<CollectionFormValue>;
  mergeNotice?: boolean;
  open: boolean;
  printingLabel: string;
  submitLabel: string;
  title: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: CollectionFormValue) => Promise<CollectionMutationResult>;
};

export function CollectionFormDialog(props: CollectionFormDialogProps) {
  if (!props.open) return null;

  return (
    <Dialog open onOpenChange={props.onOpenChange}>
      <DialogContent style={styles.dialog}>
        <CollectionForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function CollectionForm({
  availableFinishes,
  cardName,
  finishLocked = false,
  initial,
  mergeNotice = false,
  printingLabel,
  submitLabel,
  title,
  onOpenChange,
  onSubmit,
}: CollectionFormDialogProps) {
  const [quantity, setQuantity] = useState<number | null>(initial.quantity ?? 1);
  const [finish, setFinish] = useState<Finish | "">(
    initial.finish ?? (availableFinishes.length === 1 ? availableFinishes[0]! : ""),
  );
  const [language, setLanguage] = useState<CardLanguage | "">(initial.language ?? "");
  const [condition, setCondition] = useState<CardCondition | "">(initial.condition ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const quantityIsValid = quantity !== null && Number.isSafeInteger(quantity) && quantity > 0;

  async function submit() {
    if (!quantityIsValid || !finish || !language || !condition) return;

    setPending(true);
    setError("");
    try {
      await onSubmit({ condition, finish, language, quantity });
      onOpenChange(false);
    } catch (cause) {
      setError(cleanCollectionError(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Form onFormSubmit={() => void submit()}>
      <DialogTitle style={styles.title}>{title}</DialogTitle>
      <div {...stylex.props(styles.identity)}>
        <DialogDescription style={styles.description}>
          <span {...stylex.props(styles.cardName)}>{cardName}</span>
          <span {...stylex.props(styles.printingLabel)}>{printingLabel}</span>
        </DialogDescription>
      </div>

      <div {...stylex.props(styles.fields)}>
        <Field disabled={pending} name="quantity" style={styles.field}>
          <FieldLabel style={styles.label}>Quantity</FieldLabel>
          <NumberField
            disabled={pending}
            max={Number.MAX_SAFE_INTEGER}
            min={1}
            name="quantity"
            required
            value={quantity}
            onValueChange={setQuantity}
          >
            <NumberFieldGroup style={styles.quantityGroup}>
              <NumberFieldDecrement aria-label="Decrease quantity" style={styles.quantityButton}>
                −
              </NumberFieldDecrement>
              <NumberFieldInput autoFocus inputMode="numeric" style={styles.quantityInput} />
              <NumberFieldIncrement aria-label="Increase quantity" style={styles.quantityButton}>
                +
              </NumberFieldIncrement>
            </NumberFieldGroup>
          </NumberField>
        </Field>
        <CollectionSelect
          disabled={pending || finishLocked}
          label="Finish"
          name="finish"
          options={availableFinishes.map((value) => ({ label: finishLabels[value], value }))}
          placeholder="Choose finish"
          value={finish}
          onValueChange={setFinish}
        />
        <CollectionSelect
          disabled={pending}
          label="Language"
          name="language"
          options={cardLanguages.map((value) => ({ label: cardLanguageLabels[value], value }))}
          placeholder="Choose language"
          value={language}
          onValueChange={setLanguage}
        />
        <CollectionSelect
          disabled={pending}
          label="Condition"
          name="condition"
          options={cardConditions.map((value) => ({ label: cardConditionLabels[value], value }))}
          placeholder="Choose condition"
          value={condition}
          onValueChange={setCondition}
        />
      </div>

      {mergeNotice ? (
        <p {...stylex.props(styles.notice)}>
          Copies with the same finish, language and condition will be combined into one holding.
        </p>
      ) : null}
      {error ? (
        <p {...stylex.props(styles.error)} role="alert">
          {error}
        </p>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Button
          disabled={pending}
          render={<DialogClose />}
          style={styles.cancel}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          disabled={pending || !quantityIsValid || !finish || !language || !condition}
          style={styles.submit}
          type="submit"
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </Form>
  );
}

type CollectionSelectProps<Value extends string> = {
  disabled: boolean;
  label: string;
  name: string;
  options: readonly Readonly<{ label: string; value: Value }>[];
  placeholder: string;
  value: Value | "";
  onValueChange: (value: Value | "") => void;
};

function CollectionSelect<Value extends string>({
  disabled,
  label,
  name,
  options,
  placeholder,
  value,
  onValueChange,
}: CollectionSelectProps<Value>) {
  return (
    <Field disabled={disabled} name={name} style={styles.field}>
      <FieldLabel style={styles.label}>{label}</FieldLabel>
      <Select<Value>
        disabled={disabled}
        items={options}
        name={name}
        required
        value={value || null}
        onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
      >
        <SelectTrigger style={styles.selectTrigger}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

type AddToCollectionButtonProps = {
  compact?: boolean;
  detail?: CatalogCardDetail;
  printingId?: string;
};

export function AddToCollectionButton({
  compact = false,
  detail: suppliedDetail,
  printingId = suppliedDetail?.selectedPrinting.id,
}: AddToCollectionButtonProps) {
  const collection = useCollectionMutations();
  const [detail, setDetail] = useState<CatalogCardDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const selected = suppliedDetail ?? detail;

  if (suppliedDetail?.selectedPrinting.isDigital) return null;

  async function prepare() {
    if (!printingId || loading) return;
    setMessage("");

    if (suppliedDetail) {
      setOpen(true);
      return;
    }

    setLoading(true);
    try {
      const result = await window.catalog.detail(printingId);
      if (!result || result.status !== "visible") {
        setMessage("Reveal this printing before adding it.");
        return;
      }
      if (result.detail.selectedPrinting.isDigital) return;
      setDetail(result.detail);
      setOpen(true);
    } catch {
      setMessage("Card details could not be read.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div {...stylex.props(styles.addControl)}>
        <Button
          size={compact ? "icon-sm" : suppliedDetail ? "default" : "sm"}
          variant={compact ? "secondary" : "default"}
          style={compact && styles.compactAdd}
          aria-label={compact ? "Add to collection" : undefined}
          title={compact ? "Add to collection" : undefined}
          disabled={loading}
          type="button"
          onClick={() => void prepare()}
        >
          {compact ? (
            <span aria-hidden="true">{loading ? "…" : "+"}</span>
          ) : loading ? (
            "Reading…"
          ) : (
            "Add to collection"
          )}
        </Button>
        {message ? (
          <span {...stylex.props(styles.feedback)} role="status">
            {message}
          </span>
        ) : null}
      </div>
      {selected ? (
        <CollectionFormDialog
          availableFinishes={selected.selectedPrinting.finishes ?? []}
          cardName={selected.card.name}
          initial={{
            condition: "near-mint",
            language: knownLanguage(selected.selectedPrinting.language),
            quantity: 1,
          }}
          open={open}
          printingLabel={`${selected.selectedPrinting.setName} · #${selected.selectedPrinting.collectorNumber}`}
          submitLabel="Add to collection"
          title="Add copies"
          onOpenChange={setOpen}
          onSubmit={async (value) => {
            const result = await collection.add({
              ...value,
              printingId: selected.selectedPrinting.id,
            });
            setMessage(`${result.holdingQuantity.toLocaleString()} copies in this Holding`);
            return result;
          }}
        />
      ) : null}
    </>
  );
}

function knownLanguage(value: string | undefined): CardLanguage | undefined {
  const parsed = CardLanguageSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function cleanCollectionError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "The Collection could not be updated.";
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

const styles = stylex.create({
  compactAdd: {
    backgroundColor: "#20231f",
    color: "#f4f1e8",
    borderWidth: 0,
    boxShadow: "0 2px 8px #0006",
    fontSize: "20px",
    ":hover": { backgroundColor: "#324d3a" },
  },
  dialog: {
    maxWidth: "min(460px, calc(100% - 32px))",
    maxHeight: "calc(100dvh - 32px)",
    overflowY: "auto",
    padding: "28px",
    borderRadius: "16px",
    backgroundColor: "#171817",
    boxShadow: "0 24px 80px #0008",
  },
  title: {
    paddingRight: "20px",
    color: "#f4f1e8",
    fontSize: "26px",
    fontWeight: 500,
    letterSpacing: "-0.03em",
    lineHeight: 1.2,
  },
  identity: { marginTop: "20px" },
  description: { display: "grid", gap: "4px" },
  cardName: { color: "#f4f1e8", fontSize: "16px", lineHeight: 1.4 },
  printingLabel: { color: "#989b92", fontSize: "13px", lineHeight: 1.5, overflowWrap: "anywhere" },
  field: { minWidth: 0 },
  label: { color: "#b7bab2", fontSize: "12px", fontWeight: 400 },
  selectTrigger: {
    width: "100%",
    height: "44px",
    paddingInline: "14px",
    borderWidth: 0,
    borderRadius: "8px",
    backgroundColor: "#242624",
    color: "#f4f1e8",
    ":hover": { backgroundColor: "#2d302d" },
    ":focus-visible": {
      outline: `2px solid ${colors.accent}`,
      outlineOffset: "2px",
      boxShadow: "none",
    },
  },
  quantityGroup: {
    height: "44px",
    gridTemplateColumns: "44px minmax(0, 1fr) 44px",
    borderWidth: 0,
    borderRadius: "8px",
    backgroundColor: "#242624",
    ":focus-within": {
      outline: `2px solid ${colors.accent}`,
      outlineOffset: "2px",
      boxShadow: "none",
    },
  },
  quantityInput: { color: "#f4f1e8", fontSize: "16px" },
  quantityButton: {
    width: "44px",
    color: "#b7bab2",
    fontSize: "18px",
    ":hover": { backgroundColor: "#2d302d" },
  },
  fields: {
    marginTop: "28px",
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 400px)": "1fr",
    },
    gap: "20px 16px",
  },
  notice: {
    margin: "20px 0 0",
    color: "#989b92",
    fontSize: "12px",
    lineHeight: 1.55,
  },
  error: {
    margin: "16px 0 0",
    padding: "10px 12px",
    borderRadius: "8px",
    color: "#f1c7c3",
    backgroundColor: "#2d1e1e",
    fontSize: "13px",
  },
  actions: {
    marginTop: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "8px",
  },
  cancel: { height: "40px", paddingInline: "16px", color: "#b7bab2" },
  submit: {
    height: "40px",
    paddingInline: "18px",
    borderWidth: 0,
    borderRadius: "8px",
    backgroundColor: colors.accent,
    color: "#071a0e",
    ":hover": { backgroundColor: "#2cdb7d" },
    ":focus-visible": {
      outline: `2px solid ${colors.accent}`,
      outlineOffset: "3px",
      boxShadow: "none",
    },
  },
  addControl: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  feedback: {
    maxWidth: "190px",
    color: "#a6a89d",
    fontSize: "8px",
    lineHeight: 1.35,
  },
});
