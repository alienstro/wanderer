"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AdminEnergyEntry,
  type AdminUserEnergy,
  type AdminUserEnergyPage,
  ENERGY_REASON_LABELS,
  type UserEnergyAdjustInput,
} from "@wanderer/shared";
import { type FormEvent, useState } from "react";
import { adminErrorText, optionalNumber } from "@/features/admin/admin-energy";
import { ApiError, apiFetch } from "@/lib/api";
import { AdminSection } from "@/features/admin/components/admin-section";
import { Field } from "@/components/ui/form-field";
import { NumberedPager } from "@/components/ui/pager";

const QUERY_KEY = "admin-user-energy";
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The text of the errors that only this tab has. The other codes have their text in adminErrorText. */
function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code === "energy_below_zero") {
    return "The balance cannot go below 0. Take away less, or set the balance.";
  }
  return adminErrorText(error, fallback);
}

/** An energy change with its sign, such as +10 or -0.34. */
function signed(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

type Message = { error: boolean; text: string } | null;

function FormMessage({ message }: { message: Message }) {
  if (!message) {
    return null;
  }
  return (
    <p role={message.error ? "alert" : "status"} className={`m-0 text-[13px] ${message.error ? "text-error" : "text-muted"}`}>
      {message.text}
    </p>
  );
}

/** The changes of one user: the balance now, the own daily amount, and the last changes of the balance. */
function UserEnergyPanel({ user, onChanged }: { user: AdminUserEnergy; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const historyKey = [QUERY_KEY, "history", user.id];
  const history = useQuery({ queryKey: historyKey, queryFn: () => apiFetch<AdminEnergyEntry[]>(`/admin/energy/users/${user.id}/history`) });
  const [amount, setAmount] = useState("");
  const [daily, setDaily] = useState(user.ownDailyEnergy === null ? "" : String(user.ownDailyEnergy));
  const [balanceMessage, setBalanceMessage] = useState<Message>(null);
  const [dailyMessage, setDailyMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  async function save(path: string, method: "POST" | "PUT", body: object, setMessage: (message: Message) => void, doneText: (user: AdminUserEnergy) => string) {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await apiFetch<AdminUserEnergy>(`/admin/energy/users/${user.id}/${path}`, { method, body: JSON.stringify(body) });
      setMessage({ error: false, text: doneText(updated) });
      onChanged();
      void queryClient.invalidateQueries({ queryKey: historyKey });
    } catch (error) {
      setMessage({ error: true, text: errorText(error, "The change did not save. Try again.") });
    } finally {
      setBusy(false);
    }
  }

  function adjust(mode: UserEnergyAdjustInput["mode"], sign: 1 | -1) {
    const value = Number(amount);
    if (amount.trim() === "" || Number.isNaN(value) || value < 0) {
      setBalanceMessage({ error: true, text: "Type an amount of 0 or more." });
      return;
    }
    void save("adjust", "POST", { mode, amount: sign * value }, setBalanceMessage, (updated) => `The balance is now ${updated.balance}.`);
  }

  function saveDaily(event: FormEvent) {
    event.preventDefault();
    const value = optionalNumber(daily);
    if (Number.isNaN(value)) {
      setDailyMessage({ error: true, text: "Type a number, or leave the field empty." });
      return;
    }
    void save("daily", "PUT", { dailyEnergy: value }, setDailyMessage, (updated) =>
      updated.ownDailyEnergy === null ? `${user.name} now gets the global ${updated.dailyEnergy} each day.` : `${user.name} now gets ${updated.dailyEnergy} each day.`,
    );
  }

  return (
    <section aria-label={`Energy of ${user.name}`} className="grid gap-6 p-5 lg:grid-cols-3">
      <form className="flex flex-col gap-3" noValidate onSubmit={(event) => event.preventDefault()}>
        <h3 className="m-0 text-[14px] font-semibold">Change the balance</h3>
        <Field name="amount" label="Amount (energy)" hint="A change lasts until the next refill at 00:00 UTC.">
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              className="field tabular-nums"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              value={amount}
              aria-describedby={describedBy}
              placeholder="10"
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="pill pill-accent pill-sm" disabled={busy} onClick={() => adjust("add", 1)}>
            Add
          </button>
          <button type="button" className="pill pill-soft pill-sm" disabled={busy} onClick={() => adjust("add", -1)}>
            Take away
          </button>
          <button type="button" className="pill pill-soft pill-sm" disabled={busy} onClick={() => adjust("set", 1)}>
            Set balance
          </button>
        </div>
        <FormMessage message={balanceMessage} />
      </form>

      <form className="flex flex-col gap-3" noValidate onSubmit={saveDaily}>
        <h3 className="m-0 text-[14px] font-semibold">Daily amount</h3>
        <Field name="daily" label="Own daily amount (energy)" hint="The balance at each refill. Empty uses the daily energy of the settings.">
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              className="field tabular-nums"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              value={daily}
              aria-describedby={describedBy}
              placeholder="Global amount"
              onChange={(event) => setDaily(event.target.value)}
            />
          )}
        </Field>
        <div>
          <button type="submit" className="pill pill-soft pill-sm" disabled={busy}>
            Save daily amount
          </button>
        </div>
        <FormMessage message={dailyMessage} />
      </form>

      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-[14px] font-semibold">Last changes</h3>
        {history.isPending && <p className="m-0 text-[13px] text-muted">Loading…</p>}
        {history.isError && <p className="m-0 text-[13px] text-muted">The history did not load.</p>}
        {history.data?.length === 0 && <p className="m-0 text-[13px] text-muted">No changes yet. The first action of the user fills the balance.</p>}
        {history.data && history.data.length > 0 && (
          <ul className="m-0 flex list-none flex-col p-0">
            {history.data.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-[13px] last:border-b-0">
                <span className="flex flex-col">
                  <span>{ENERGY_REASON_LABELS[entry.reason]}</span>
                  <span className="text-[12px] text-subtle">{dateFormat.format(new Date(entry.createdAt))}</span>
                </span>
                <span className={`tabular-nums ${entry.amount < 0 ? "text-muted" : "text-text"}`}>{signed(entry.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const ROW = "border-t border-line align-top max-[760px]:grid max-[760px]:grid-cols-2 max-[760px]:gap-3 max-[760px]:p-4";

function UserRow({ user, open, onToggle }: { user: AdminUserEnergy; open: boolean; onToggle: () => void }) {
  return (
    <tr className={ROW}>
      <td className="max-w-[360px] py-3.5 pr-4 pl-4 max-[760px]:col-span-2 max-[760px]:max-w-none max-[760px]:p-0">
        <span className="block font-semibold text-text">
          {user.name}
          {user.role === "admin" && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-normal text-muted">Admin</span>}
        </span>
        <span className="block truncate text-[13px] text-subtle">
          {user.handle ? `@${user.handle}` : "No handle"}
        </span>
        <span className="block truncate text-[12px] text-subtle">{user.email}</span>
      </td>
      <td className="py-3.5 pr-4 tabular-nums max-[760px]:p-0">
        <span className="block text-[11px] text-subtle min-[761px]:hidden">Balance</span>
        <span className="text-[18px] font-semibold text-text">{user.balance}</span> <span className="text-[12px] text-subtle">energy</span>
      </td>
      <td className="py-3.5 pr-4 tabular-nums max-[760px]:p-0">
        <span className="block text-[11px] text-subtle min-[761px]:hidden">Each day</span>
        <span className="block">{user.dailyEnergy}</span>
        <span className={`block text-[12px] ${user.ownDailyEnergy === null ? "text-subtle" : "text-link"}`}>
          {user.ownDailyEnergy === null ? "global" : "own"}
        </span>
      </td>
      <td className="py-3 pr-4 text-right max-[760px]:col-span-2 max-[760px]:p-0 max-[760px]:text-left">
        <button type="button" className="pill pill-soft pill-sm" aria-expanded={open} onClick={onToggle}>
          Manage
        </button>
      </td>
    </tr>
  );
}

/** The admin tab "User energy": search the users, and change the balance or the own daily amount of one user. */
export function AdminUserEnergyList() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams({ ...(query ? { q: query } : {}), page: String(page) });
  const users = useQuery({
    queryKey: [QUERY_KEY, "list", query, page],
    queryFn: () => apiFetch<AdminUserEnergyPage>(`/admin/energy/users?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  if (users.error instanceof ApiError && users.error.status === 403) {
    return <p className="m-0 text-muted">This page is for the admin.</p>;
  }
  const changed = () => void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "list"] });

  return (
    <AdminSection
      id="user-energy-title"
      title="Users"
      hint="The balance shows what a user has now. A refill at 00:00 UTC sets each balance to the daily amount of the user: an own daily amount, or the daily energy of the settings."
    >
      <form
        role="search"
        className="flex max-w-[520px] gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setOpen(null);
          setQuery(search.trim());
        }}
      >
        <input
          type="search"
          aria-label="Search users"
          className="field flex-1"
          placeholder="Name, handle or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit" className="pill pill-soft">
          Search
        </button>
      </form>
      {users.isPending && <p className="m-0 text-muted">Loading the users…</p>}
      {users.isError && !(users.error instanceof ApiError && users.error.status === 403) && (
        <p className="m-0 text-muted">The users did not load. Reload the page to try again.</p>
      )}
      {users.data && (
        <div className="panel overflow-hidden">
          <table className="w-full border-collapse text-left max-[760px]:block">
            <thead className="max-[760px]:hidden">
              <tr className="text-[12px] text-subtle">
                <th scope="col" className="py-2.5 pr-4 pl-4 font-medium">
                  User
                </th>
                <th scope="col" className="py-2.5 pr-4 font-medium">
                  Balance now
                </th>
                <th scope="col" className="py-2.5 pr-4 font-medium">
                  Each day
                </th>
                <th scope="col" className="py-2.5 pr-4">
                  <span className="sr-only">Manage</span>
                </th>
              </tr>
            </thead>
            <tbody className="max-[760px]:block">
              {users.data.users.length === 0 && (
                <tr className="border-t border-line max-[760px]:block">
                  <td colSpan={4} className="px-4 py-6 text-muted max-[760px]:block">
                    No user matches “{query}”. Search for a part of a name, a handle or an email.
                  </td>
                </tr>
              )}
              {users.data.users.flatMap((user) => [
                <UserRow key={user.id} user={user} open={open === user.id} onToggle={() => setOpen(open === user.id ? null : user.id)} />,
                open === user.id && (
                  <tr key={`${user.id}-panel`} className="bg-surface-2 max-[760px]:block">
                    <td colSpan={4} className="max-[760px]:block">
                      <UserEnergyPanel user={user} onChanged={changed} />
                    </td>
                  </tr>
                ),
              ])}
            </tbody>
          </table>
        </div>
      )}
      {users.data && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-muted tabular-nums">
            {users.data.total} {users.data.total === 1 ? "user" : "users"}
          </span>
          <NumberedPager
            label="User pages"
            page={users.data.page}
            pageCount={users.data.pageCount}
            onPage={(next) => {
              setOpen(null);
              setPage(next);
            }}
          />
        </div>
      )}
    </AdminSection>
  );
}
