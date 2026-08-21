import { Dialog } from "@base-ui/react/dialog";
import { Field } from "@base-ui/react/field";
import { Form } from "@base-ui/react/form";
import { NumberField } from "@base-ui/react/number-field";
import { Select } from "@base-ui/react/select";
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

import { Button } from "../../components/button";
import { colors } from "../../styles/tokens.stylex.js";

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
    <Dialog.Root open onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
        <Dialog.Viewport {...stylex.props(styles.viewport)}>
          <Dialog.Popup {...stylex.props(styles.popup)}>
            <CollectionForm {...props} />
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
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
      setError(cleanIpcError(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Form {...stylex.props(styles.form)} onFormSubmit={() => void submit()}>
      <div {...stylex.props(styles.topline)}>
        <span>Collection / Physical copy</span>
        <Dialog.Close {...stylex.props(styles.close)} aria-label="Close">
          ×
        </Dialog.Close>
      </div>
      <Dialog.Title {...stylex.props(styles.title)}>{title}</Dialog.Title>
      <Dialog.Description {...stylex.props(styles.printing)}>{printingLabel}</Dialog.Description>

      <div {...stylex.props(styles.fields)}>
        <Field.Root {...stylex.props(styles.field)} disabled={pending} name="quantity">
          <Field.Label {...stylex.props(styles.label)}>Quantity</Field.Label>
          <NumberField.Root
            disabled={pending}
            max={Number.MAX_SAFE_INTEGER}
            min={1}
            name="quantity"
            required
            value={quantity}
            onValueChange={setQuantity}
          >
            <NumberField.Group {...stylex.props(styles.numberGroup)}>
              <NumberField.Decrement
                {...stylex.props(styles.numberButton)}
                aria-label="Decrease quantity"
              >
                −
              </NumberField.Decrement>
              <NumberField.Input
                {...stylex.props(styles.numberInput)}
                autoFocus
                inputMode="numeric"
              />
              <NumberField.Increment
                {...stylex.props(styles.numberButton)}
                aria-label="Increase quantity"
              >
                +
              </NumberField.Increment>
            </NumberField.Group>
          </NumberField.Root>
        </Field.Root>
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
        <Button disabled={pending} render={<Dialog.Close />} type="button" variant="ghost">
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
    <Field.Root {...stylex.props(styles.field)} disabled={disabled} name={name}>
      <Field.Label {...stylex.props(styles.label)}>{label}</Field.Label>
      <Select.Root<Value>
        disabled={disabled}
        items={options}
        name={name}
        required
        value={value || null}
        onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
      >
        <Select.Trigger {...stylex.props(styles.selectTrigger)}>
          <Select.Value placeholder={placeholder} />
          <Select.Icon {...stylex.props(styles.selectIcon)} aria-hidden="true">
            <svg {...stylex.props(styles.selectIconGraphic)} fill="none" viewBox="0 0 12 8">
              <path d="m1 1.5 5 5 5-5" />
            </svg>
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            {...stylex.props(styles.selectPositioner)}
            align="start"
            alignItemWithTrigger={false}
            sideOffset={6}
          >
            <Select.Popup {...stylex.props(styles.selectPopup)}>
              <Select.List {...stylex.props(styles.selectList)}>
                {options.map((option) => (
                  <Select.Item
                    {...stylex.props(styles.selectItem)}
                    key={option.value}
                    value={option.value}
                  >
                    <span {...stylex.props(styles.selectIndicatorSlot)}>
                      <Select.ItemIndicator {...stylex.props(styles.selectIndicator)}>
                        ✓
                      </Select.ItemIndicator>
                    </span>
                    <Select.ItemText>{option.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </Field.Root>
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
        <Button size="small" type="button" onClick={() => void prepare()}>
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
            const result = await window.collection.add({
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

export function cleanIpcError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "The Collection could not be updated.";
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

const styles = stylex.create({
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    backgroundColor: "rgba(5, 6, 5, 0.78)",
    backdropFilter: "blur(6px)",
  },
  viewport: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    padding: "24px",
    display: "grid",
    placeItems: "center",
    overflowY: "auto",
  },
  popup: {
    width: "min(620px, calc(100vw - 48px))",
    padding: 0,
    border: "1px solid #55584f",
    borderRadius: "4px",
    color: "#f4f1e8",
    backgroundColor: "#0d0d0d",
    boxShadow: "18px 20px 0 rgba(0, 0, 0, 0.46)",
    outline: "none",
  },
  form: {
    padding: "0 28px 28px",
    backgroundImage: "linear-gradient(145deg, rgba(17, 197, 101, 0.04), transparent 42%)",
  },
  topline: {
    minHeight: "46px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #34362f",
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.13em",
    textTransform: "uppercase",
  },
  close: {
    width: "32px",
    height: "32px",
    border: 0,
    color: "#a6a89d",
    backgroundColor: "transparent",
    fontSize: "18px",
    cursor: "pointer",
  },
  title: {
    margin: "30px 0 0",
    color: "#f4f1e8",
    fontSize: "40px",
    fontWeight: 400,
    letterSpacing: "-0.045em",
    lineHeight: 0.95,
  },
  printing: {
    margin: "14px 0 0",
    color: "#a6a89d",
    fontSize: "11px",
    lineHeight: 1.5,
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
  field: {
    display: "grid",
    gap: "8px",
  },
  label: {
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  numberGroup: {
    width: "100%",
    height: "44px",
    display: "flex",
    alignItems: "stretch",
    border: "1px solid #43463e",
    borderRadius: "2px",
    backgroundColor: "#151613",
    overflow: "hidden",
    ":focus-within": {
      borderColor: colors.accent,
      boxShadow: "0 0 0 3px rgba(17, 197, 101, 0.1)",
    },
    "[data-disabled]": { opacity: 0.65 },
  },
  numberInput: {
    width: "100%",
    minWidth: 0,
    height: "100%",
    padding: 0,
    border: 0,
    color: "#f4f1e8",
    backgroundColor: "transparent",
    fontSize: "11px",
    textAlign: "center",
    outline: "none",
  },
  numberButton: {
    width: "38px",
    minWidth: "38px",
    padding: 0,
    border: 0,
    color: "#a6a89d",
    backgroundColor: "transparent",
    fontSize: "16px",
    cursor: "pointer",
    ":hover:not(:disabled)": {
      color: "#f4f1e8",
      backgroundColor: "rgba(244, 241, 232, 0.05)",
    },
    ":focus-visible": {
      position: "relative",
      outline: `2px solid ${colors.accent}`,
      outlineOffset: "-2px",
    },
    ":disabled": { cursor: "not-allowed", opacity: 0.45 },
  },
  selectTrigger: {
    width: "100%",
    height: "44px",
    paddingInline: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    border: "1px solid #43463e",
    borderRadius: "2px",
    color: "#f4f1e8",
    backgroundColor: "#151613",
    fontSize: "11px",
    textAlign: "left",
    cursor: "pointer",
    outline: "none",
    transition: "border-color 130ms ease, box-shadow 130ms ease",
    ":hover:not(:disabled)": { borderColor: "#696c63" },
    ":focus-visible": {
      borderColor: colors.accent,
      boxShadow: "0 0 0 3px rgba(17, 197, 101, 0.1)",
    },
    "[data-popup-open]": { borderColor: colors.accent },
    "[data-placeholder]": { color: "#85887e" },
    "[data-disabled]": { color: "#85887e", cursor: "not-allowed", opacity: 0.65 },
  },
  selectIcon: {
    width: "12px",
    height: "8px",
    flex: "0 0 auto",
    color: "#85887e",
    transition: "transform 130ms ease",
    "[data-popup-open]": { transform: "rotate(180deg)" },
  },
  selectIconGraphic: {
    width: "100%",
    height: "100%",
    display: "block",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  selectPositioner: {
    zIndex: 120,
  },
  selectPopup: {
    width: "var(--anchor-width)",
    maxWidth: "calc(100vw - 32px)",
    border: "1px solid #55584f",
    borderRadius: "3px",
    color: "#f4f1e8",
    backgroundColor: "#151613",
    boxShadow: "0 16px 42px rgba(0, 0, 0, 0.52)",
    outline: "none",
    transformOrigin: "var(--transform-origin)",
    transition: {
      default: "opacity 130ms ease, transform 130ms cubic-bezier(0.23, 1, 0.32, 1)",
      "@media (prefers-reduced-motion: reduce)": "opacity 130ms ease",
    },
    "[data-starting-style]": {
      opacity: 0,
      transform: {
        default: "scale(0.98)",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
    },
    "[data-ending-style]": {
      opacity: 0,
      transform: {
        default: "scale(0.98)",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
    },
  },
  selectList: {
    maxHeight: "min(276px, var(--available-height))",
    padding: "6px",
    overflowY: "auto",
  },
  selectItem: {
    minHeight: "36px",
    paddingInline: "8px",
    display: "grid",
    gridTemplateColumns: "18px minmax(0, 1fr)",
    alignItems: "center",
    gap: "5px",
    borderRadius: "2px",
    color: "#b8baaf",
    fontSize: "10px",
    cursor: "pointer",
    outline: "none",
    "[data-highlighted]": {
      color: "#f4f1e8",
      backgroundColor: "rgba(244, 241, 232, 0.065)",
    },
    "[data-selected]": { color: "#f4f1e8" },
  },
  selectIndicatorSlot: {
    width: "18px",
    height: "18px",
    display: "grid",
    placeItems: "center",
  },
  selectIndicator: {
    color: colors.accent,
    fontSize: "10px",
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
    borderLeft: "3px solid #d98c83",
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
