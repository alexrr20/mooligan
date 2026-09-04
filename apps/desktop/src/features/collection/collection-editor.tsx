import type { CatalogCardDetail } from "@mooligan/domain/catalog-detail";
import {
  CardLanguageSchema,
  cardConditions,
  cardLanguages,
  type CardCondition,
  type CardLanguage,
  type CollectionMutationResult,
} from "@mooligan/domain/collection";
import type { Finish } from "@mooligan/domain/catalog";
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
import { useCollectionMutations } from "./use-collection-mutations";

export type CollectionFormValue = {
  condition: CardCondition;
  finish: Finish;
  language: CardLanguage;
  quantity: number;
};

type CollectionFormDialogProps = {
  availableFinishes: readonly Finish[];
  finishLocked?: boolean;
  initial: Partial<CollectionFormValue>;
  mergeNotice?: boolean;
  open: boolean;
  printingLabel: string;
  title: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: CollectionFormValue) => Promise<CollectionMutationResult>;
};

export function CollectionFormDialog(props: CollectionFormDialogProps) {
  if (!props.open) return null;

  return (
    <Dialog open onOpenChange={props.onOpenChange}>
      <DialogContent>
        <CollectionForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function CollectionForm({
  availableFinishes,
  finishLocked = false,
  initial,
  mergeNotice = false,
  printingLabel,
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
      <div {...stylex.props(styles.topline)}>
        <span>Collection / Physical copy</span>
      </div>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{printingLabel}</DialogDescription>

      <div {...stylex.props(styles.fields)}>
        <Field disabled={pending} name="quantity">
          <FieldLabel>Quantity</FieldLabel>
          <NumberField
            disabled={pending}
            max={Number.MAX_SAFE_INTEGER}
            min={1}
            name="quantity"
            required
            value={quantity}
            onValueChange={setQuantity}
          >
            <NumberFieldGroup>
              <NumberFieldDecrement aria-label="Decrease quantity">−</NumberFieldDecrement>
              <NumberFieldInput autoFocus inputMode="numeric" />
              <NumberFieldIncrement aria-label="Increase quantity">+</NumberFieldIncrement>
            </NumberFieldGroup>
          </NumberField>
        </Field>
        <CollectionSelect
          disabled={pending || finishLocked}
          label="Finish"
          name="finish"
          options={availableFinishes.map((value) => ({ label: finishLabel(value), value }))}
          placeholder="Choose finish"
          value={finish}
          onValueChange={setFinish}
        />
        <CollectionSelect
          disabled={pending}
          label="Language"
          name="language"
          options={cardLanguages}
          placeholder="Choose language"
          value={language}
          onValueChange={setLanguage}
        />
        <CollectionSelect
          disabled={pending}
          label="Condition"
          name="condition"
          options={cardConditions}
          placeholder="Choose condition"
          value={condition}
          onValueChange={setCondition}
        />
      </div>

      {mergeNotice ? (
        <p {...stylex.props(styles.notice)}>
          If these properties match another Holding, Mooligan will merge the quantities.
        </p>
      ) : null}
      {error ? (
        <p {...stylex.props(styles.error)} role="alert">
          {error}
        </p>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Button
          disabled={pending || !quantityIsValid || !finish || !language || !condition}
          type="submit"
        >
          {pending ? "Saving…" : "Save to collection"}
        </Button>
        <Button disabled={pending} render={<DialogClose />} type="button" variant="ghost">
          Cancel
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
    <Field disabled={disabled} name={name}>
      <FieldLabel>{label}</FieldLabel>
      <Select<Value>
        disabled={disabled}
        items={options}
        name={name}
        required
        value={value || null}
        onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
      >
        <SelectTrigger>
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
  detail?: CatalogCardDetail;
  printingId?: string;
};

export function AddToCollectionButton({
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
        <Button size="sm" type="button" onClick={() => void prepare()}>
          {loading ? "Reading…" : "Add to collection"}
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
          initial={{
            condition: "near-mint",
            language: knownLanguage(selected.selectedPrinting.language),
            quantity: 1,
          }}
          open={open}
          printingLabel={`${selected.card.name} · ${selected.selectedPrinting.setName} #${selected.selectedPrinting.collectorNumber}`}
          title="Add copies."
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

export function finishLabel(value: Finish) {
  return value === "nonfoil" ? "Nonfoil" : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function cleanCollectionError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "The Collection could not be updated.";
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

const styles = stylex.create({
  topline: {
    minHeight: "46px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.13em",
    textTransform: "uppercase",
  },
  fields: {
    marginTop: "28px",
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 560px)": "1fr",
    },
    gap: "14px",
  },
  notice: {
    margin: "18px 0 0",
    color: "#a6a89d",
    fontSize: "10px",
    lineHeight: 1.55,
  },
  error: {
    margin: "16px 0 0",
    padding: "10px 12px",
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
    borderLeftColor: "#d98c83",
    color: "#f1c7c3",
    backgroundColor: "#2d1e1e",
    fontSize: "10px",
  },
  actions: {
    marginTop: "24px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
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
