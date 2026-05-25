# Disclaimer

## 1. What This Is

**Retirement Corpus & Income Planner** is a local-first planning and educational
tool. It helps you model corpus durability, monthly income, tax drag, inflation,
sequence risk, and allocation across a retirement horizon.

It is **not financial advice**. It is **not investment advice**. It is **not tax
advice**. No output produced by this tool — on screen, in an exported PDF, in an
exported CSV, or in the "Adviser / CA Pack" review bundle — constitutes a
professional opinion or regulated recommendation of any kind.

## 2. For Investment Advice

Consult a **SEBI-registered Investment Adviser (RIA)**. In India, investment
advice to individuals is a regulated activity under the SEBI (Investment Advisers)
Regulations, 2013. An RIA is required to act in your fiduciary interest, assess
your risk profile, and give personalised recommendations. This tool does none of
those things.

SEBI's registration check for Investment Advisers:
<https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13>

## 3. For Tax Advice

Consult a **Chartered Accountant (CA)**. Tax decisions — what to file, what to
declare, which deductions to claim, whether a particular instrument qualifies for
a particular treatment — are filing-grade decisions. They carry legal
consequences. This tool operates at planning grade only. The Institute of Chartered
Accountants of India (ICAI) regulates the CA profession in India.

## 4. Tax Law Scope

The default tax ruleset bundled with this tool is scoped to:

- **Assessment Year 2026-27** (income earned in FY 2025-26)
- **Finance Act, 2025** (India) — 7-band new-regime slabs, ₹12 lakh §87A
  threshold, FA-2025 capital gains rates

This is confirmed by the version string `"FY 2025-26 / AY 2026-27 baseline"` in
the application source (`src/model.js`).

**The bundled ruleset will be outdated when the assessment year rolls over.** Tax
slabs, surcharge thresholds, exemption limits, and rebate conditions change
annually with each Finance Act. You must verify that the rules in force at the
time of your actual filing match the values loaded in the tool. The tool's
Tax Studio provides an editable tax-law JSON so you can update these values
yourself; it is your responsibility to ensure the values are current and correct
before relying on any tax output.

## 5. Monte Carlo Simulation Caveat

The Monte Carlo simulation runs seeded pseudo-random paths under the return
assumptions you supply. **Past or simulated returns do not guarantee future
results.** The simulated paths are statistical scenarios generated under stated
assumptions about return distributions, standard deviations, and portfolio
glide paths. They are not predictions. They do not account for every source of
real-world risk — including regulatory changes, force-majeure events, fund
closure, or counterparty failure. A high success probability in the simulation
is not a guarantee that the plan will succeed in practice.

## 6. Use at Your Own Risk

You use this tool entirely at your own risk. The tool, its outputs, and any
files it generates are provided for informational and planning purposes only.
Do not make irreversible financial, investment, or tax decisions based solely
on outputs from this tool without independent professional review.

## 7. No Warranty

As stated in the MIT License (`LICENSE` at the root of this repository):

> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## 8. Jurisdiction

This tool is designed for Indian retirement and income planning under Indian tax
law. It makes **no representations about regulatory compliance in any other
jurisdiction**. Non-resident Indians (NRIs) should note that the tool's NRI flag
simplifies — it does not fully model — the tax treatment applicable to NRIs, DTAA
applicability, FEMA obligations, or the tax treatment in the country of residence.
Users in other jurisdictions or with filing requirements outside India assume full
responsibility for determining whether this tool's outputs are applicable to their
circumstances. Consult a local tax or legal professional if you are in any doubt.

---

## Related Documents

- Privacy posture and data handling: [PRIVACY.md](PRIVACY.md)
- Software license terms: [LICENSE](LICENSE)
- Project overview and quickstart: [README.md](README.md)

---

## Revision History

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-05-19 | Initial public release |
