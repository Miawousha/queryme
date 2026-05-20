"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type IdentifyModalProps = {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
};

type Step = "form" | "code" | "submitting";

export function IdentifyModal({ conversationId, open, onClose, onSuccess }: IdentifyModalProps) {
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [role, setRole] = useState("");
  const [purpose, setPurpose] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("submitting");
    const res = await fetch("/api/identify/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, name, company, workEmail, role, purpose: purpose || undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Request failed" }));
      setError(body.error ?? "Request failed");
      setStep("form");
      return;
    }
    setStep("code");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep("submitting");
    const res = await fetch("/api/identify/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, workEmail, code }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Verification failed");
      setStep("code");
      return;
    }
    onSuccess(body.token);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[var(--color-background)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "form" || step === "submitting" ? (
          <form className="flex flex-col gap-3" onSubmit={submitForm}>
            <h2 className="text-base font-semibold">Identify yourself</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Sensitive details (salary, references, private contact) are visible after verifying your work email. This is logged — please use your real identity.
            </p>
            <Field label="Name" value={name} onChange={setName} required />
            <Field label="Company" value={company} onChange={setCompany} required />
            <Field label="Work email" value={workEmail} onChange={setWorkEmail} type="email" required />
            <Field label="Role" value={role} onChange={setRole} required placeholder="Recruiter, Hiring Manager, …" />
            <label className="flex flex-col gap-1 text-xs">
              <span>Purpose (optional)</span>
              <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} />
            </label>
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={step === "submitting"}>Cancel</Button>
              <Button type="submit" disabled={step === "submitting"}>
                {step === "submitting" ? "Sending…" : "Send code"}
              </Button>
            </div>
          </form>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={submitCode}>
            <h2 className="text-base font-semibold">Enter the 6-digit code</h2>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              We sent a code to <strong>{workEmail}</strong>. It&apos;s valid for 10 minutes.
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              className={cn(
                "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)]",
                "p-3 text-center text-2xl tracking-[0.5em] font-mono",
              )}
              placeholder="000000"
            />
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("form")}>Back</Button>
              <Button type="submit" disabled={code.length !== 6}>Verify</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required = false, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span>{label}{required && <span className="text-red-600"> *</span>}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
      />
    </label>
  );
}
