# Quick Dial matching simulation. Each member has hidden "looks", "vibe", "personality" appeal (what the
# average person sees) plus personal taste noise, and a dialling style (generous ... selective) that shifts
# every score they give. We play N days of the real rules and measure who gets mutuals.
import numpy as np, sys
rng = np.random.default_rng(int(sys.argv[1]) if len(sys.argv) > 1 else 1)

def run(n=2000, days=14, threshold=70, mode='absolute', plus_share=0.0, gold_share=0.0, order='dialled_first', weights=(40,20,40), active_rate=0.6, deck='random', marker=False, free_per_day=3):
    # appeal on a 0-100-ish scale; personality partly independent of looks
    looks = rng.normal(55, 14, n).clip(5, 95)
    pers  = (0.25 * (looks - 55) + rng.normal(58, 13, n)).clip(5, 95)
    vibe  = (0.5 * (pers - 58) + rng.normal(56, 12, n)).clip(5, 95)
    style = rng.normal(0, 12, n)                     # +ve generous, -ve selective
    gender = rng.integers(0, 2, n)                   # simple: everyone wants the other gender
    tier = np.where(rng.random(n) < gold_share, 2, np.where(rng.random(n) < plus_share / max(1e-9, 1 - gold_share), 1, 0))
    per_day = np.array([free_per_day, 8, 40])[tier]             # "unlimited" ≈ 40 in practice
    w = np.array(weights) / sum(weights)
    score = {}                                       # (rater, subject) -> weighted score
    given = [[] for _ in range(n)]                   # each rater's history, for relative thresholds
    mutual_day = {}
    received_today = np.zeros(n); received_total = np.zeros(n)
    def dial(a, b):
        taste = rng.normal(0, 10, 3)                 # a's personal taste for b
        parts = np.array([looks[b], vibe[b], pers[b]]) + taste + style[a]
        parts = parts.clip(1, 100)
        s = float(np.clip(round(parts @ w), 1, 100))
        score[(a, b)] = s; given[a].append(s); received_today[b] += 1; received_total[b] += 1
        return s
    def high(a, s):
        if mode == 'absolute': return s >= threshold
        hist = given[a]
        if len(hist) < 3: return s >= threshold
        # relative: in the top 30% of what this person gives, or 70+, whichever is easier, but never under 55
        return s >= max(55, min(threshold, np.percentile(hist, 70)))
    for day in range(days):
        received_today[:] = 0
        active = np.where(rng.random(n) < active_rate)[0]
        rng.shuffle(active)
        for a in active:
            for _ in range(per_day[a]):
                pool = np.where((gender != gender[a]))[0]
                cand = [c for c in rng.choice(pool, 60, replace=False) if (a, c) not in score]
                if not cand: break
                liked_me = [c for c in cand if score.get((c, a), 0) >= threshold] if order == 'dialled_first' else []
                rest = [c for c in cand if c not in liked_me]
                if deck == 'balanced':
                    # fewest Dials received (all time and today) first, with a shuffle; up to 3 who dialled you high
                    rest.sort(key=lambda c: received_total[c] * 0.5 + received_today[c] * 3 + rng.random() * 6)
                    cand = liked_me[:3] + rest[: 10 - len(liked_me[:3])]
                else:
                    cand = (liked_me + rest)[:10]
                # the person picks whoever they're most drawn to (looks-led first impression); a "dialled you"
                # marker adds curiosity
                def pull(c):
                    return looks[c] + rng.normal(0, 12) + (12 if (marker is True or (marker == 'paid' and tier[a] > 0)) and c in liked_me else 0)
                pick = max(cand, key=pull)
                s = dial(a, pick)
                if (pick, a) in score and high(a, s) and high(pick, score[(pick, a)]):
                    key = tuple(sorted((a, pick)))
                    mutual_day.setdefault(key, day)
    mutuals = np.zeros(n)
    for (a, b) in mutual_day: mutuals[a] += 1; mutuals[b] += 1
    received = np.zeros(n)
    for (a, b) in score: received[b] += 1
    q = np.quantile(looks, [0.2, 0.8])
    return dict(
        mutual_pairs=len(mutual_day),
        pct_with_mutual=(mutuals > 0).mean() * 100,
        median_mutuals=np.median(mutuals),
        bottom20_looks_pct=(mutuals[looks <= q[0]] > 0).mean() * 100,
        top20_looks_pct=(mutuals[looks >= q[1]] > 0).mean() * 100,
        selective_pct=(mutuals[style < -10] > 0).mean() * 100,
        generous_pct=(mutuals[style > 10] > 0).mean() * 100,
        never_dialled_pct=(received == 0).mean() * 100,
        top10_share_of_dials=np.sort(received)[-n // 10:].sum() / max(1, received.sum()) * 100,
        free_pct=(mutuals[tier == 0] > 0).mean() * 100 if (tier == 0).any() else float('nan'),
        paid_pct=(mutuals[tier > 0] > 0).mean() * 100 if (tier > 0).any() else float('nan'),
    )

def show(name, r):
    print(f"{name:44s} pairs {r['mutual_pairs']:5d} | anyMutual {r['pct_with_mutual']:5.1f}% | "
          f"bottom20 {r['bottom20_looks_pct']:5.1f}% top20 {r['top20_looks_pct']:5.1f}% | "
          f"selective {r['selective_pct']:5.1f}% generous {r['generous_pct']:5.1f}% | "
          f"neverDialled {r['never_dialled_pct']:4.1f}% top10%share {r['top10_share_of_dials']:4.1f}% | "
          f"free {r['free_pct']:5.1f}% paid {r['paid_pct']:5.1f}%")

if __name__ == '__main__':
    import statistics as st
    for name, kw in [('Before', dict(free_per_day=3)),
                     ('After (launch: everyone free, 5/day)', dict(deck='balanced', mode='relative', marker='paid', free_per_day=5)),
                     ('After (plans live: 15% Quick+, 3% Gold)', dict(deck='balanced', mode='relative', marker='paid', free_per_day=5, plus_share=0.15, gold_share=0.03))]:
        rs = [run(**kw) for _ in range(3)]
        avg = {k: st.mean(r[k] for r in rs) for k in rs[0]}
        avg['mutual_pairs'] = int(avg['mutual_pairs'])
        show(name, avg)
