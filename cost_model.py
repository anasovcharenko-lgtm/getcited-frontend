"""What one answer costs, and what a plan has to charge to survive it.

Every figure here is a unit cost that can be checked against a real invoice.
The uncertain one is flagged: OpenAI bills the search tool per call AND bills
the search content it pulls back as input tokens, and how many tokens that is
depends on the query. That single line is most of the cost of an audit, so it
is the one worth measuring from an actual bill rather than trusting here.
"""

# ---- per answer, in dollars ------------------------------------------------
# An "answer" = one prompt put to one model, once.

OPENAI_SEARCH_CALL   = 0.010    # $10 / 1k calls, published
OPENAI_SEARCH_TOKENS = 0.032    # ~8k search-content tokens @ $4/1M  ← ESTIMATE
OPENAI_OUTPUT        = 0.006    # ~300 output tokens @ $20/1M

COST = {
    # the expensive one, and the one that cannot be dropped
    "chatgpt":     OPENAI_SEARCH_CALL + OPENAI_SEARCH_TOKENS + OPENAI_OUTPUT,
    # grounding is $14/1k prompts after a free monthly allowance
    "gemini":      0.014,
    # measured from the rate card: $5/1k request fee + tokens
    "perplexity":  0.007,
    "deepseek":    0.002,
    # DataForSEO SERP + async AI overview
    "ai_overview": 0.004,
}

GEMINI_FREE_PROMPTS_PER_MONTH = 5000   # free grounding allowance
WEEKS_PER_MONTH = 4.33

# ---- fixed monthly, regardless of customers --------------------------------
FIXED = {"Railway": 5, "Vercel": 0, "Supabase": 0, "domain": 1.5}


def answers_per_month(prompts: int, models: int, runs_per_week: float) -> float:
    return prompts * models * runs_per_week * WEEKS_PER_MONTH


def monthly_cost(prompts: int, model_keys: list[str], runs_per_week: float,
                 brands: int = 1, gemini_free_left: int = 0) -> dict:
    per_run = prompts * brands
    runs = runs_per_week * WEEKS_PER_MONTH
    total = 0.0
    breakdown = {}
    for m in model_keys:
        calls = per_run * runs
        unit = COST[m]
        if m == "gemini":
            billable = max(0.0, calls - gemini_free_left)
            cost = billable * unit
        else:
            cost = calls * unit
        breakdown[m] = cost
        total += cost
    return {"total": total, "breakdown": breakdown,
            "answers": per_run * runs * len(model_keys)}


def price_for(cost: float, gross_margin: float = 0.80) -> float:
    """What to charge so the API bill is (1 - margin) of revenue."""
    return cost / (1 - gross_margin)


def show(name, prompts, models, runs_per_week, brands=1, gemini_free=0):
    r = monthly_cost(prompts, models, runs_per_week, brands, gemini_free)
    print(f"\n{name}")
    print(f"  {brands} brand(s) x {prompts} prompts x {len(models)} models "
          f"x {runs_per_week}/week  =  {r['answers']:,.0f} answers/month")
    for m, c in sorted(r["breakdown"].items(), key=lambda x: -x[1]):
        share = c / r["total"] * 100 if r["total"] else 0
        print(f"    {m:12} ${c:7.2f}   {share:4.1f}%")
    print(f"  API cost          ${r['total']:7.2f}")
    for margin in (0.70, 0.80, 0.85):
        print(f"  price @ {int(margin*100)}% margin  ${price_for(r['total'], margin):7.0f}")
    return r


print("=" * 64)
print("PER ANSWER")
for m, c in sorted(COST.items(), key=lambda x: -x[1]):
    print(f"  {m:12} ${c:.4f}")
print(f"  {'ALL FIVE':12} ${sum(COST.values()):.4f}")
print(f"\nFixed monthly: ${sum(FIXED.values()):.2f}  ({FIXED})")

ALL = list(COST)
SEARCH_3 = ["chatgpt", "perplexity", "ai_overview"]
CHEAP_2  = ["chatgpt", "perplexity"]

print("\n" + "=" * 64)
print("WHAT A CUSTOMER COSTS")
show("Starter-ish: 20 prompts, 2 models, weekly", 20, CHEAP_2, 1)
show("Mid: 50 prompts, 3 models, weekly",         50, SEARCH_3, 1, gemini_free=0)
show("Mid, DAILY instead of weekly",              50, SEARCH_3, 7)
show("Full: 50 prompts, 5 models, weekly",        50, ALL, 1, gemini_free=5000)
show("Agency: 5 brands x 40 prompts, 3 models, weekly", 40, SEARCH_3, 1, brands=5)


print("\n" + "=" * 64)
print("CANDIDATE PLANS")
print("=" * 64)

PLANS = [
    # name,            brands, prompts, models,  runs/wk, price EUR
    ("Free trial",          1,  10, CHEAP_2,     0.25,   0),
    ("Solo",                1,  25, ALL,         1,     39),
    ("Growth",              2,  50, ALL,         1,     99),
    ("Agency",              8,  50, ALL,         1,    299),
]

for name, brands, prompts, models, runs, price in PLANS:
    r = monthly_cost(prompts, models, runs, brands, gemini_free_left=5000)
    cost = r["total"]
    margin = (price - cost) / price * 100 if price else 0
    print(f"\n{name:12} EUR {price:>4}/mo")
    print(f"  {brands} brand(s), {prompts} prompts, {len(models)} models, "
          f"{runs}/wk -> {r['answers']:,.0f} answers/mo")
    print(f"  cost ${cost:6.2f}   gross margin {margin:5.1f}%"
          f"   headroom ${price - cost:6.2f}")

print("\n" + "=" * 64)
print("SENSITIVITY: the one number worth measuring")
print("=" * 64)
print("OpenAI search-content tokens is an estimate. Growth plan cost if it is:")
for tokens, label in ((2000, "2k"), (4000, "4k"), (8000, "8k (assumed)"), (16000, "16k")):
    COST["chatgpt"] = OPENAI_SEARCH_CALL + (tokens / 1_000_000 * 4.0) + OPENAI_OUTPUT
    r = monthly_cost(50, ALL, 1, 2, gemini_free_left=5000)
    print(f"  {label:14} chatgpt ${COST['chatgpt']:.4f}/answer -> "
          f"Growth costs ${r['total']:6.2f}, margin at EUR99 = "
          f"{(99 - r['total'])/99*100:5.1f}%")
