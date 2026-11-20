"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, fetchApi } from "@/lib/api";
import type {
  PatronDetail,
  PatronOptionsResponse,
} from "@/lib/patrons/types";

export type PatronWrite = {
  surname?: string | null;
  firstname?: string | null;
  preferred_name?: string | null;
  cardnumber?: string | null;
  userid?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  library_id?: string | null;
  category_id?: string | null;
  expiry_date?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  staff_notes?: string | null;
  confirm_duplicate?: boolean;
};

export type PatronFormDialogProps = {
  mode: "create" | "edit";
  patronId?: number;
  initial?: PatronDetail;
  canSensitive: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FormFields = {
  surname: string;
  firstname: string;
  preferred_name: string;
  cardnumber: string;
  userid: string;
  email: string;
  phone: string;
  mobile: string;
  library_id: string;
  category_id: string;
  expiry_date: string;
  date_of_birth: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  staff_notes: string;
};

const EMPTY_FORM: FormFields = {
  surname: "",
  firstname: "",
  preferred_name: "",
  cardnumber: "",
  userid: "",
  email: "",
  phone: "",
  mobile: "",
  library_id: "",
  category_id: "",
  expiry_date: "",
  date_of_birth: "",
  address: "",
  address2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
  staff_notes: "",
};

function str(value: string | null | undefined): string {
  return value ?? "";
}

function formFromPatron(patron: PatronDetail | undefined): FormFields {
  if (!patron) {
    return { ...EMPTY_FORM };
  }
  return {
    surname: str(patron.surname),
    firstname: str(patron.firstname),
    preferred_name: str(patron.preferred_name),
    cardnumber: str(patron.cardnumber),
    userid: str(patron.userid),
    email: str(patron.email),
    phone: str(patron.phone),
    mobile: str(patron.mobile),
    library_id: str(patron.library_id),
    category_id: str(patron.category_id),
    expiry_date: str(patron.expiry_date),
    date_of_birth: str(patron.date_of_birth),
    address: str(patron.address),
    address2: str(patron.address2),
    city: str(patron.city),
    state: str(patron.state),
    postal_code: str(patron.postal_code),
    country: str(patron.country),
    staff_notes: str(patron.staff_notes),
  };
}

function buildWritePayload(
  fields: FormFields,
  canSensitive: boolean,
): PatronWrite {
  const body: PatronWrite = {
    surname: fields.surname || null,
    firstname: fields.firstname || null,
    preferred_name: fields.preferred_name || null,
    cardnumber: fields.cardnumber || null,
    userid: fields.userid || null,
    email: fields.email || null,
    phone: fields.phone || null,
    mobile: fields.mobile || null,
    library_id: fields.library_id || null,
    category_id: fields.category_id || null,
    expiry_date: fields.expiry_date || null,
  };
  if (canSensitive) {
    body.date_of_birth = fields.date_of_birth || null;
    body.address = fields.address || null;
    body.address2 = fields.address2 || null;
    body.city = fields.city || null;
    body.state = fields.state || null;
    body.postal_code = fields.postal_code || null;
    body.country = fields.country || null;
    body.staff_notes = fields.staff_notes || null;
  }
  return body;
}

function fieldErrorsFromDetail(
  detail: Record<string, unknown> | undefined,
): Record<string, string> {
  const raw = detail?.fields;
  if (!Array.isArray(raw)) {
    return {};
  }
  const map: Record<string, string> = {};
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      "name" in entry &&
      "message" in entry
    ) {
      map[String((entry as { name: string }).name)] = String(
        (entry as { message: string }).message,
      );
    }
  }
  return map;
}

function FormField({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-foreground">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PatronFormDialog({
  mode,
  patronId,
  initial,
  canSensitive,
  open,
  onOpenChange,
}: PatronFormDialogProps) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<FormFields>(EMPTY_FORM);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [topMessage, setTopMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicateConflict, setDuplicateConflict] = useState(false);
  const wasOpenRef = useRef(false);

  const optionsQuery = useQuery({
    queryKey: ["patrons", "options"],
    queryFn: () => fetchApi<PatronOptionsResponse>("/patrons/options"),
    enabled: open,
  });

  const categories = optionsQuery.data?.categories ?? null;
  const libraries = optionsQuery.data?.libraries ?? null;
  const optionsPending = optionsQuery.isPending;
  const optionsUnavailable =
    optionsQuery.isError ||
    categories === null ||
    libraries === null;

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;

    if (!open) {
      setConfirming(false);
      setSubmitting(false);
      setTopMessage(null);
      setFieldErrors({});
      setDuplicateConflict(false);
      return;
    }

    if (!wasOpen) {
      setFields(formFromPatron(initial));
      setConfirming(false);
      setTopMessage(null);
      setFieldErrors({});
      setDuplicateConflict(false);
    }
  }, [open, initial]);

  function setField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!(key in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function runSubmit(confirmDuplicate: boolean) {
    setSubmitting(true);
    setTopMessage(null);
    if (!confirmDuplicate) {
      setFieldErrors({});
    }
    try {
      const body = buildWritePayload(fields, canSensitive);
      if (mode === "create") {
        if (confirmDuplicate) {
          body.confirm_duplicate = true;
        }
        await fetchApi<PatronDetail>("/patrons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        if (patronId == null) {
          throw new Error("Patron id is required for edit.");
        }
        await fetchApi<PatronDetail>(`/patrons/${patronId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["patrons"] });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        const code = error.detail?.code;
        if (error.status === 409 && code === "patron_duplicate") {
          setDuplicateConflict(true);
          setTopMessage("Koha already has a patron with that identifier.");
          setConfirming(false);
        } else if (code === "validation_error" || code === "patron_rejected") {
          setTopMessage(error.detail?.message ?? error.message);
          setFieldErrors(fieldErrorsFromDetail(error.detail));
          setConfirming(false);
        } else {
          setTopMessage(error.detail?.message ?? error.message);
          setConfirming(false);
        }
      } else if (error instanceof Error) {
        setTopMessage(error.message);
        setConfirming(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSaveClick() {
    if (!confirming) {
      setConfirming(true);
      setDuplicateConflict(false);
      setTopMessage(null);
      return;
    }
    void runSubmit(false);
  }

  function handleConfirmDuplicate() {
    void runSubmit(true);
  }

  const title = mode === "create" ? "Add patron" : "Edit patron";
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={!submitting}
      >
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {topMessage ? (
            <div className="mb-4 flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2">
              <p className="text-sm text-foreground">{topMessage}</p>
              {duplicateConflict && mode === "edit" ? (
                <p className="text-sm text-muted-foreground">
                  Enter a different card number or userid.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="patron-surname"
              label="Surname"
              required={isCreate}
              error={fieldErrors.surname}
            >
              <Input
                id="patron-surname"
                value={fields.surname}
                onChange={(e) => setField("surname", e.target.value)}
                aria-invalid={fieldErrors.surname != null}
                disabled={submitting}
              />
            </FormField>
            <FormField
              id="patron-firstname"
              label="First name"
              error={fieldErrors.firstname}
            >
              <Input
                id="patron-firstname"
                value={fields.firstname}
                onChange={(e) => setField("firstname", e.target.value)}
                aria-invalid={fieldErrors.firstname != null}
                disabled={submitting}
              />
            </FormField>
            <FormField
              id="patron-preferred-name"
              label="Preferred name"
              error={fieldErrors.preferred_name}
            >
              <Input
                id="patron-preferred-name"
                value={fields.preferred_name}
                onChange={(e) => setField("preferred_name", e.target.value)}
                aria-invalid={fieldErrors.preferred_name != null}
                disabled={submitting}
              />
            </FormField>
            <FormField
              id="patron-cardnumber"
              label="Card number"
              error={fieldErrors.cardnumber}
            >
              <Input
                id="patron-cardnumber"
                value={fields.cardnumber}
                onChange={(e) => setField("cardnumber", e.target.value)}
                aria-invalid={fieldErrors.cardnumber != null}
                disabled={submitting}
              />
            </FormField>
            <FormField
              id="patron-userid"
              label="Userid"
              error={fieldErrors.userid}
            >
              <Input
                id="patron-userid"
                value={fields.userid}
                onChange={(e) => setField("userid", e.target.value)}
                aria-invalid={fieldErrors.userid != null}
                disabled={submitting}
              />
            </FormField>
            <FormField
              id="patron-email"
              label="Email"
              error={fieldErrors.email}
            >
              <Input
                id="patron-email"
                type="email"
                value={fields.email}
                onChange={(e) => setField("email", e.target.value)}
                aria-invalid={fieldErrors.email != null}
                disabled={submitting}
              />
            </FormField>
            <FormField
              id="patron-phone"
              label="Phone"
              error={fieldErrors.phone}
            >
              <Input
                id="patron-phone"
                value={fields.phone}
                onChange={(e) => setField("phone", e.target.value)}
                aria-invalid={fieldErrors.phone != null}
                disabled={submitting}
              />
            </FormField>
            <FormField
              id="patron-mobile"
              label="Mobile"
              error={fieldErrors.mobile}
            >
              <Input
                id="patron-mobile"
                value={fields.mobile}
                onChange={(e) => setField("mobile", e.target.value)}
                aria-invalid={fieldErrors.mobile != null}
                disabled={submitting}
              />
            </FormField>
            <FormField
              id="patron-library"
              label="Library"
              required={isCreate}
              error={fieldErrors.library_id}
            >
              <Select
                value={fields.library_id}
                disabled={submitting || optionsPending || optionsUnavailable}
                onValueChange={(value) => {
                  if (value != null) {
                    setField("library_id", value);
                  }
                }}
              >
                <SelectTrigger
                  id="patron-library"
                  className="w-full"
                  aria-invalid={fieldErrors.library_id != null}
                >
                  <SelectValue placeholder="Select library">
                    {(value: string | null) =>
                      optionsUnavailable
                        ? "Unavailable"
                        : value
                          ? (libraries?.find((lib) => lib.id === value)?.name ??
                            value)
                          : "Select library"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {(libraries ?? []).map((lib) => (
                    <SelectItem key={lib.id} value={lib.id}>
                      {lib.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              id="patron-category"
              label="Category"
              required={isCreate}
              error={fieldErrors.category_id}
            >
              <Select
                value={fields.category_id}
                disabled={submitting || optionsPending || optionsUnavailable}
                onValueChange={(value) => {
                  if (value != null) {
                    setField("category_id", value);
                  }
                }}
              >
                <SelectTrigger
                  id="patron-category"
                  className="w-full"
                  aria-invalid={fieldErrors.category_id != null}
                >
                  <SelectValue placeholder="Select category">
                    {(value: string | null) =>
                      optionsUnavailable
                        ? "Unavailable"
                        : value
                          ? (categories?.find(
                              (cat) => cat.patron_category_id === value,
                            )?.name ?? value)
                          : "Select category"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {(categories ?? []).map((cat) => (
                    <SelectItem
                      key={cat.patron_category_id}
                      value={cat.patron_category_id}
                    >
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              id="patron-expiry"
              label="Expiry date"
              error={fieldErrors.expiry_date}
            >
              <Input
                id="patron-expiry"
                type="date"
                value={fields.expiry_date}
                onChange={(e) => setField("expiry_date", e.target.value)}
                aria-invalid={fieldErrors.expiry_date != null}
                disabled={submitting}
              />
            </FormField>

            {canSensitive ? (
              <>
                <FormField
                  id="patron-dob"
                  label="Date of birth"
                  error={fieldErrors.date_of_birth}
                >
                  <Input
                    id="patron-dob"
                    type="date"
                    value={fields.date_of_birth}
                    onChange={(e) =>
                      setField("date_of_birth", e.target.value)
                    }
                    aria-invalid={fieldErrors.date_of_birth != null}
                    disabled={submitting}
                  />
                </FormField>
                <div className="sm:col-span-2" />
                <FormField
                  id="patron-address"
                  label="Address"
                  error={fieldErrors.address}
                >
                  <Input
                    id="patron-address"
                    value={fields.address}
                    onChange={(e) => setField("address", e.target.value)}
                    aria-invalid={fieldErrors.address != null}
                    disabled={submitting}
                  />
                </FormField>
                <FormField
                  id="patron-address2"
                  label="Address 2"
                  error={fieldErrors.address2}
                >
                  <Input
                    id="patron-address2"
                    value={fields.address2}
                    onChange={(e) => setField("address2", e.target.value)}
                    aria-invalid={fieldErrors.address2 != null}
                    disabled={submitting}
                  />
                </FormField>
                <FormField
                  id="patron-city"
                  label="City"
                  error={fieldErrors.city}
                >
                  <Input
                    id="patron-city"
                    value={fields.city}
                    onChange={(e) => setField("city", e.target.value)}
                    aria-invalid={fieldErrors.city != null}
                    disabled={submitting}
                  />
                </FormField>
                <FormField
                  id="patron-state"
                  label="State"
                  error={fieldErrors.state}
                >
                  <Input
                    id="patron-state"
                    value={fields.state}
                    onChange={(e) => setField("state", e.target.value)}
                    aria-invalid={fieldErrors.state != null}
                    disabled={submitting}
                  />
                </FormField>
                <FormField
                  id="patron-postal"
                  label="Postal code"
                  error={fieldErrors.postal_code}
                >
                  <Input
                    id="patron-postal"
                    value={fields.postal_code}
                    onChange={(e) => setField("postal_code", e.target.value)}
                    aria-invalid={fieldErrors.postal_code != null}
                    disabled={submitting}
                  />
                </FormField>
                <FormField
                  id="patron-country"
                  label="Country"
                  error={fieldErrors.country}
                >
                  <Input
                    id="patron-country"
                    value={fields.country}
                    onChange={(e) => setField("country", e.target.value)}
                    aria-invalid={fieldErrors.country != null}
                    disabled={submitting}
                  />
                </FormField>
                <FormField
                  id="patron-staff-notes"
                  label="Staff notes"
                  error={fieldErrors.staff_notes}
                >
                  <Textarea
                    id="patron-staff-notes"
                    value={fields.staff_notes}
                    onChange={(e) => setField("staff_notes", e.target.value)}
                    aria-invalid={fieldErrors.staff_notes != null}
                    disabled={submitting}
                    className="min-h-20"
                  />
                </FormField>
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-border px-4 py-3">
          {confirming ? (
            <p className="mb-2 w-full text-sm text-foreground sm:mb-0 sm:mr-auto">
              Save this patron to Koha?
            </p>
          ) : null}
          {duplicateConflict && mode === "create" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={handleConfirmDuplicate}
            >
              Confirm duplicate
            </Button>
          ) : null}
          {confirming ? (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirming(false)}
            >
              Back
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            disabled={submitting}
            onClick={handleSaveClick}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}