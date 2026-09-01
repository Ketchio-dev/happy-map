# Korean vs English public-service page parity check (2026-09-01)

Collected by Aside browser agent; eTA apply pair independently re-verified via aside repl (KO Date modified 2018-06-12, EN 2026-08-28).

## Summary
- pairs checked: 8 (all live today, Sep 1 2026; no logins, no forms)
- real mismatches found: 2 page pairs with substantive differences (eTA apply EN/KO; TFW "report abuse" EN/KO), plus 1 date-lag-only pair (eTA facts)
- Korean versions that are static PDFs while English is live HTML: 2 (Ontario standard-lease guide; Ontario diabetes "My Diabetes Passport")

## Per pair

### 1. eTA "facts" (IRCC) — content matches, EN newer by 49 days
- EN URL: https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta/facts.html / Date modified: 2024-04-23
- KO URL: https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta/facts-ko.html / Date modified: 2024-03-05 (HTML)
- Facts table:

| fact | EN quote | KO quote | verdict |
|---|---|---|---|
| Validity | "valid for up to five years or until the passport expires, whichever comes first" | "최장 5년 또는 여권 만기일 중 더 짧은 시한까지 유효합니다" | MATCH |
| Stay length | "short stays (normally for up to six months at a time)" | "단기 체류(대개 방문당 최장 6개월)" | MATCH |
| Fee | "An eTA costs CAD $7" | "eTA 신청비는 캐나다화 $7입니다" | MATCH |
| Processing | "Most applicants get their eTA approval (via an email) within minutes. However, some requests can take several days" | "대부분 신청자는 몇 분 안에 eTA 승인(이메일)을 받습니다. … 처리에 며칠이 걸리기도합니다" | MATCH |
| Help-guide file size | "eTA help guide (PDF, 1.62 MB)" | "eTA 도움 안내서 (PDF, 1.99 MB)" | MISMATCH (different file sizes; not decision-critical) |

- Lag days: 49 (EN 2024-04-23 is newer than KO 2024-03-05)

### 2. eTA "How to apply" (IRCC) — big lag, notices missing in Korean ★
- EN URL: https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta/apply.html / Date modified: 2026-08-28
- KO URL: https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta/apply-ko.html / Date modified: 2018-06-12 (HTML)
- Facts table:

| fact | EN quote | KO quote | verdict |
|---|---|---|---|
| Fee | "pay the $7 CAD fee (non-refundable)" | "신청료CAD$7(환불 불가)를 결제할" | MATCH |
| Indonesia/Malaysia eligibility | "As of May 26, 2026, citizens of Indonesia and Malaysia who meet certain requirements may be eligible to apply for an eTA instead of a visitor visa" | (absent) | MISSING-IN-KOREAN |
| US LPR exemption | "As of April 26, 2022, lawful permanent residents of the United States are exempt from the eTA requirement." | (absent) | MISSING-IN-KOREAN |
| Ebola measures deadline | "Ebola disease: Temporary measures extended until September 28, 2026" | (absent) | MISSING-IN-KOREAN |
| Payment methods | "Visa®, Mastercard®, American Express®, a pre-paid Visa…, Visa Debit, or Debit Mastercard, UnionPay®, or JCB Card®" | same list, then additionally "Interac®" ("JCB Card® 또는 Interac®") | MISMATCH (KO adds Interac, EN does not list it) |
| Supporting-docs notice time | (EN says only "some requests can take several days" on facts page; apply page has no 72-hour claim) | "72시간 내에 안내문이 이메일로 발송됩니다" | MISSING-IN-ENGLISH |

- Lag days: 2,999 (KO frozen at 2018-06-12 while EN updated 2026-08-28)

### 3. Ontario standard-lease guide — content matches, KO is a stale static PDF
- EN URL: https://www.ontario.ca/page/guide-ontarios-standard-lease / Updated: October 27, 2025 (live HTML + PDF)
- KO URL: https://files.ontario.ca/mmah-guide-to-standard-lease-for-rental-housing-ko-2022-04-19.pdf / printed "2021년 3월", file URL dated 2022-04-19 (PDF)
- Facts table:

| fact | EN quote | KO quote | verdict |
|---|---|---|---|
| Rent increase notice | "give the tenant at least 90 days' notice before the rent increase is to take effect" | "임대료 인상의 효력이 발생하기 최소 90 일 이전에 임차인에게 통지해야 합니다" | MATCH |
| Increase frequency | "the landlord can increase the rent only once every 12 months" | "임대인은 12 개월에 딱 한번의 임대료를 인상시킬 수 있습니다" | MATCH |
| Guideline exemption date | "no part of the building was occupied for residential purposes on or before November 15, 2018" | "건물의 어느 부분도 2018 년 11 월 15 일이나 그 이전에 주거용으로 점유되지 않은 경우" | MATCH |
| Tenant notice to end tenancy | "At least 60 days' notice, if they have a monthly or fixed term tenancy, or At least 28 days' notice, if they have a daily or weekly tenancy" | "월간 또는 고정기간 임대 계약의 경우 최소 60 일 전에 통보, 또는 일일 또는 주간 임대 계약의 경우 최소 28 일 전에 통보" | MATCH |
| Lease copy deadline | "provide it to you within 21 calendar days" | "계약서에 서명한 후 21 일 이내에 … 사본을 전달해야 합니다" | MATCH |

- Lag days: EN HTML updated 2025-10-27 vs KO PDF printed March 2021 (≈1,700 days) / file date 2022-04-19 (≈1,287 days). Content itself is same version; the Korean copy is what's frozen.

### 4. Ontario "Preventing and living with diabetes" — Korean "version" is the Passport tool, targets match
- EN URL: https://www.ontario.ca/page/preventing-and-living-diabetes (live HTML; page-level numbers: "Almost 1.5 million Ontarians have diabetes")
- KO URL: https://www.ontario.ca/files/2025-01/pass-goal-card-korean.pdf (PDF; file actually contains the Korean My Diabetes Passport; printed "Queen's Printer for Ontario 2014")
- Facts table (passport tool):

| fact | EN quote | KO quote | verdict |
|---|---|---|---|
| A1C target | "a1c … target level ‡ <_7.0%" | "A1C (혈당검사) … 목표 수치‡ <_7.0%" | MATCH |
| LDL-C target | "<_2.0 mmol/l" | "<_2.0 mmol/L" | MATCH |
| Blood pressure target | "<130/80 mmhg" | "<130/80 mmHg" | MATCH |
| Telehealth phone | "1-866-797-0000" | "1-866-797-0000" | MATCH |
| eGFR target | ">60 ml/min" | ">60 mL/min" | MATCH |

- Note: the Korean link is labeled "My Diabetes Passport … 한국어 (Korean)" but the file is named `pass-goal-card-korean.pdf` (wrong filename, correct content). Lag: not computable (EN page shows no date; both files in /files/2025-01/).

### 5. TFW "How to report abuse" (ESDC) — Korean is NEWER and differs from English ★
- EN URL: https://www.canada.ca/en/employment-social-development/services/foreign-workers/report-abuse.html / Date modified: 2024-09-19
- KO URL: https://www.canada.ca/en/employment-social-development/services/foreign-workers/report-abuse-ko.html / Date modified: 2025-11-17 (HTML; Korean is 424 days NEWER than English)
- Facts table:

| fact | EN quote | KO quote | verdict |
|---|---|---|---|
| Emergency number | "call 9-1-1 now. It's a free call from any Canadian telephone number." | "위험에 처한 경우 즉시 9-1-1에 신고하십시오. 캐나다 전화번호에서 걸면 통화료가 부과되지 않습니다." | MATCH |
| Tip line | "You can call 1-866-602-9448 … available 24 hours a day, 7 days a week" | "1-866-602-9448로 전화하여 학대를 신고할 수 있습니다. … 하루 24시간 이용할 수 있습니다" | MATCH |
| Agent hours | "Monday to Friday from 6:30 am to 8 pm Eastern time" | "월-금요일 오전 6:30 – 오후 8시(동부표준시)" | MATCH |
| Online report buttons | 1 button: "Report abuse" | 2 buttons: "근로자 또는 시민의 일원으로서 학대에 관해 신고하고자 하는 경우" + "영사관이나 변호 단체 소속인 경우, 여기에 신고" | MISSING-IN-ENGLISH |
| Mailing address | "Send the information to: Temporary Foreign Worker Program Branch, Service Canada, 140 Promenade du Portage, 5th Floor, Box 520, Gatineau QC K1A 0J2" | "기타 학대 신고 방법 … 우편 신고" (no address at all) | MISSING-IN-KOREAN |

### 6. TFW "Your rights are protected" (ESDC) — in sync
- EN URL: https://www.canada.ca/en/employment-social-development/services/foreign-workers/protected-rights.html / Date modified: 2025-07-25
- KO URL: https://www.canada.ca/en/employment-social-development/services/foreign-workers/protected-rights-ko.html / Date modified: 2025-07-25 (HTML)
- Facts table:

| fact | EN quote | KO quote | verdict |
|---|---|---|---|
| Abuse report line | "Service Canada confidential tip line 1-866-602-9448" | "서비스 캐나다 기밀 신고처 1-866-602-9448" | MATCH |
| Ontario employment standards | "Ontario: 1-800-531-5551" | "1-800-531-5551" (present in Korean text) | MATCH |
| SAWP free housing | "your employer must provide adequate housing for free (except British Columbia…)" | "적절한 주택을 무료로 제공해야 합니다(…브리티시 컬럼비아는 제외)" | MATCH |
| Mexico/Caribbean exception | "If you are a seasonal agricultural worker from Mexico or the Caribbean… exceptions" | "멕시코 또는 카리브해에서 계절 농업 종사자가 되는 경우… 적용되지 않습니다" | MATCH |

- Lag days: 0 (identical dates)

### 7. Ontario "Residential rent increases" — no Korean version exists
- EN URL: https://www.ontario.ca/page/residential-rent-increases / Updated: June 23, 2026. Fact: "The rent increase guideline for 2027 is 1.9%"; "at least 12 months"; "90 days" written notice.
- KO: none — no Korean page or Korean PDF is linked anywhere on the page; a Google search surfaced no Korean translation.
- Verdict: MISSING-IN-KOREAN (entire fact set unavailable in Korean on the source page).

### 8. Toronto.ca — no publicly accessible static Korean versions of program pages
- EN URL (example): https://www.toronto.ca/community-people/health-wellness-care/health-programs-advice/tuberculosis-tb/ (Date modified: June 30, 2026; key facts: "Telephone: 416-338-7600", hours "Monday to Friday 8:30 a.m. - 4:30 p.m.")
- KO: none on the page. The "Translations" accordion lists "한국어 / Korean" but only as "To request a copy, email us at targettb@toronto.ca or call 416-338-7600".
- https://www.toronto.ca/home/translate/ offers Google Translate + 311 (180+ languages) only; the Vacant Home Tax page states "Information is available in … 한국어 … by calling 311."
- Verdict: no public Korean document to compare (request-by-email/phone only).

## Best evidence for a demo video
1. **eTA apply, 8-year-old Korean page missing 2026 policy changes** — EN (2026-08-28): "As of May 26, 2026, citizens of Indonesia and Malaysia … may be eligible to apply for an eTA instead of a visitor visa" and "Ebola disease: Temporary measures extended until September 28, 2026." KO (dated 2018-06-12) has neither, and additionally lists "Interac®" as a payment method that EN's list doesn't include. URLs: `…/eta/apply.html` vs `…/eta/apply-ko.html`.
2. **TFW report-abuse: Korean page is newer than English but drops the mailing address** — EN (2024-09-19) gives the full address "Temporary Foreign Worker Program Branch, Service Canada, 140 Promenade du Portage, 5th Floor, Box 520, Gatineau QC K1A 0J2"; KO (2025-11-17) says only "우편 신고" with no address, while adding a second online-report button ("영사관이나 변호 단체 소속인 경우, 여기에 신고") that EN doesn't have. URLs: `…/foreign-workers/report-abuse.html` vs `…/report-abuse-ko.html`.
3. **Standard lease: live English page (updated Oct 27, 2025) vs Korean PDF frozen at March 2021** — content happens to match, but Korean readers get a 1,700+-day-old document while the English page is current; only 2 of the 8 pairs had matching dates, and no mismatch was invented where none exists (pairs 1, 3, 4, 6 match on all decision-critical facts).

