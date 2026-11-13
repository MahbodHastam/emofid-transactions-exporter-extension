# Emofid transactions API notes

Source: static reading of the site's public JS bundles (2026-11-12), plus what real
exports showed. Items marked *unverified* were not confirmed against a live response.

The extension reads the site's own JSON API instead of scraping the page.

## Endpoint (Transactions tab, «تراکنش‌ها»)

| | |
|---|---|
| Method / URL | `POST https://api-mofidapp.emofid.com/web/tbs/api/v1/user/accountHistory/me` |
| Body | `{"skip": <offset>, "pageSize": 20}` |
| Response | `{"data": {"items": [...]}}` (SPA unwraps `response.data.data`) |
| Next page | SPA asks for `skip = 20 * pagesLoaded` while `items.length === 20` |
| Total count | not used by SPA; *unverified* whether present |
| Date / direction params | none sent by SPA → client-side filtering |
| Sort | newest first on screen; *unverified* in API contract (extension checks it before early-stop) |

It is a read endpoint despite being POST. The read-only guard is therefore an
allowlist of one exact method + URL, not "GET only".

## Item fields (as used by the SPA's `TransactionItem`)

| Field | Use in SPA | Notes |
|---|---|---|
| `voucherDate` | `dayjs(v).calendar('jalali').format('dddd، D MMMM YYYY')` | Format *unverified* (ISO string or epoch). Extension accepts ISO with/without offset, epoch s/ms, or a Jalali `YYYY/MM/DD` |
| `description` | row title | |
| `voucherDetailDescription` | expanded detail text (already in list payload, no extra request) | |
| `amount` | formatted as-is (formatter keeps `-`) | Always positive in practice; direction is not in the sign |
| `voucherType` | icon: `…/transactions/${voucherType}.svg` | Only place direction is expressed in the UI (green/red arrow). Seen so far: `Deposit`, `Withdrawal`, `Transfer` |
| `remain` | «مانده حساب» balance after the row | |

There is **no id field**. The SPA keys rows by `pageIndex-rowIndex`.

### Direction

No explicit field in the code. Extension derives it, in order:
1. negative `amount` → out;
2. `remain[i] − remain[older neighbour] == ±amount` → in / out (self-validating);
3. unanimous direction already learned for the same `voucherType`;
4. trade side parsed from the description (buy → out, sell → in);
5. otherwise `unknown` (shown under *all* only, with a warning).

### Trades

Buys and sells are ordinary rows (`Withdrawal` / `Deposit`). The details live only in the
text of `voucherDetailDescription`, in this shape:

```
خرید تعداد <quantity> سهم <company>(<symbol>1) به نرخ <price> به شماره اعلامیه <id>
فروش تعداد <quantity> سهم <company>(<symbol>1) به نرخ <price> به شماره اعلامیه <id>
```

`description` (the row title) is `خرید سهم <symbol>` or `فروش سهم <symbol>`. The text mixes
Arabic and Persian letter forms (`خريد` / `خرید`), so it is normalized before matching.
`amount` is the cash actually moved, so `amount − quantity × price` is commission (plus tax
on sells).

## Auth

- `Authorization: Bearer <accessToken>`; token lives in the SPA's encrypted
  "secure local storage" (`user_auth_data`). `withCredentials: false` — no cookies.
- Other headers the SPA sends: `Content-Type: application/json`, `Appname-Versionname`,
  `Cache-Control: no-cache`, `Pragma: no-cache`, `Expires: 0`.
- 401 → SPA refreshes the token itself; 440 → session revoked, SPA logs out.
- Extension approach: a MAIN-world script observes the `Authorization` header on the
  SPA's own requests to the API host, keeps it in a closure (never stored, never passed
  to the isolated world or anywhere else) and replays it only to the one allowlisted URL.

## Other tabs (v2)

| Tab | Endpoint | Paging |
|---|---|---|
| سود پس‌انداز | `POST tbs/api/v1/user/hamiProfit/me` | same `skip` / `pageSize: 20`, same item shape |
| انتقال به دیگران | `GET cardTransfer/api/v1/transaction/melli/report` | `pageIndex`, `pageSize: 10`, `startDate` (unix s, default now−2y), `endDate` (ms). Items: `id`, `amount`, `status`, `transactionDate`, `ownerDestinationHolder`, `destinationBankName` |

## `isFromMcJet`

Not referenced by the transactions page chunk. Extension ignores query params.

## Still to verify on a real response

- `voucherDate` format and whether it carries a time of day.
- The full set of `voucherType` values.
- Description formats for fund units, rights and bonds.
- Whether `pageSize` above 20 is accepted (extension uses 20, like the SPA).
- Rate-limit headers.
