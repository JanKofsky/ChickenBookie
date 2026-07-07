"use client";

import { FormEvent, useState } from "react";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setStatus("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, website })
      });
      const data = await response.json();
      if (!response.ok && data.mailto) {
        window.location.href = data.mailto;
        setStatus("Opening your email app...");
        return;
      }
      if (!response.ok) throw new Error(data.error ?? "Could not send message.");
      setName("");
      setEmail("");
      setMessage("");
      setStatus("Message sent. The coop office got it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      <label className="hidden-field">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
      <label>Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} /></label>
      <button type="submit" disabled={sending}>{sending ? "Sending..." : "Send message"}</button>
      {status && <p className={status.includes("sent") ? "form-ok" : "form-error"}>{status}</p>}
    </form>
  );
}
