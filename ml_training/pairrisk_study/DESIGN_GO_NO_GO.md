# PairRisk Design-Stage GO/NO-GO Report

**Formal decision: `COUNT_SENSITIVITY_PAPER_GO`**

This report is generated reproducibly from aggregate outputs in `artifacts/pairrisk/design_run_v2`. It is a design-stage analysis, not calibration or locked-test evidence.

## 1. Integrity and scope

| Item | Result |
|---|---:|
| Images after identifier deduplication | 3,297 |
| Total lesions | 1,693 |
| Multi-view lesions | 740 |
| Design lesions | 677 |
| Design multi-view lesions analyzed | 296 |
| Calibration lesions (assignment count only; no outcomes used) | 1,016 |
| Frozen split reused | yes (`frozen_split_file`) |
| `final_test_accessed` | `false` |
| Primary alpha | 0.10 |
| Global LogMeanExp tau | 0.05 (frozen; not reselected) |

The normalized-identifier duplicate audit removed 0 rows. Byte-level duplicate checking is **incomplete**: 0 image hashes were attempted because no image root was supplied. No claim of complete byte-level duplicate exclusion is made.

## 2. Main cross-fitted results

| Method | Coverage | Average set size | Median set size | Singleton rate | Singleton accuracy | CSC | SSY | Empty-set rate | Full-set rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Mean probability | 90.9% | 2.547 | 2.0 | 16.9% | 88.0% | 96.0% | 16.2% | 1.7% | 0.0% |
| Mean APS score | 90.2% | 2.470 | 2.0 | 27.7% | 87.8% | 100.0% | 27.7% | 1.7% | 0.0% |
| Global LogMeanExp (tau=0.05) | 90.2% | 2.395 | 2.0 | 28.0% | 85.5% | 98.2% | 27.5% | 0.7% | 0.0% |
| Nested LogMeanExp | 89.2% | 2.351 | fold medians 2.0-3.0 | 28.0% | 83.1% | 97.0% | 27.2% | 0.7% | 0.0% |
| PairRisk (k=2) | 90.2% | 2.392 | 2.0 | 26.0% | 80.5% | 95.5% | 24.8% | 0.7% | 0.0% |
| Maximum | 90.5% | 2.466 | 2.0 | 23.3% | 87.0% | 92.6% | 21.6% | 0.7% | 0.0% |

The five fixed methods use pooled out-of-fold lesion results. Nested LogMeanExp uses lesion-count-weighted outer-fold summaries; its pooled median cannot be reconstructed from fold aggregates, so the observed fold-median range is shown. Individual-method confidence intervals were not exported; paired difference intervals are reported below.

## 3. PairRisk versus maximum

| Metric | PairRisk | Comparator | PairRisk - comparator | Paired 95% CI |
|---|---:|---:|---:|---:|
| Average set size | 2.392 | 2.466 | -0.074 | [-0.166, 0.020] |
| Coverage | 90.2% | 90.5% | -0.3 pp | [-3.7%, 2.7%] |
| Singleton rate | 26.0% | 23.3% | +2.7 pp | [-1.0%, 6.4%] |
| Singleton accuracy | 80.5% | 87.0% | -6.4 pp | [-15.1%, 1.9%] |
| CSC | 95.5% | 92.6% | +2.9 pp | [-3.2%, 9.0%] |
| SSY | 24.8% | 21.6% | +3.2 pp | [0.2%, 6.6%] |

PairRisk reduced average set size by 0.074 sets per lesion, a 3.0% relative reduction from maximum's 2.466. The set-size interval [-0.166, 0.020] crosses zero. The effect is therefore **below the originally planned 5% effect, small in magnitude, and not interval-supported as a real efficiency reduction**. Its SSY gain was +3.2 percentage points with a positive interval, but the singleton-accuracy and CSC intervals include no difference.

**Answers.** The efficiency effect is not materially strong enough for a full PairRisk claim. The interval does not establish a real reduction. The point estimate is below 5%, at about 3.0%.

## 4. PairRisk versus simple mean

### Mean probability

| Metric | PairRisk | Comparator | PairRisk - comparator | Paired 95% CI |
|---|---:|---:|---:|---:|
| Average set size | 2.392 | 2.547 | -0.155 | [-0.243, -0.068] |
| Coverage | 90.2% | 90.9% | -0.7 pp | [-3.4%, 2.0%] |
| Singleton rate | 26.0% | 16.9% | +9.1 pp | [4.7%, 13.9%] |
| Singleton accuracy | 80.5% | 88.0% | -7.5 pp | [-16.4%, 1.2%] |
| CSC | 95.5% | 96.0% | -0.5 pp | [-5.9%, 5.3%] |
| SSY | 24.8% | 16.2% | +8.6 pp | [4.4%, 13.2%] |

### Mean APS score

| Metric | PairRisk | Comparator | PairRisk - comparator | Paired 95% CI |
|---|---:|---:|---:|---:|
| Average set size | 2.392 | 2.470 | -0.078 | [-0.159, 0.003] |
| Coverage | 90.2% | 90.2% | +0.0 pp | [-2.7%, 2.7%] |
| Singleton rate | 26.0% | 27.7% | -1.7 pp | [-5.7%, 2.0%] |
| Singleton accuracy | 80.5% | 87.8% | -7.3 pp | [-14.5%, -0.6%] |
| CSC | 95.5% | 100.0% | -4.5 pp | [-9.4%, -0.6%] |
| SSY | 24.8% | 27.7% | -2.9 pp | [-6.6%, 0.8%] |

PairRisk retains contradictory-view sensitivity by construction and empirically occupies an intermediate count-sensitivity position between simple means and maximum. Against mean probability it used smaller sets (-0.155) and raised SSY, both with intervals excluding zero. Against mean APS score, however, its set-size interval crossed zero, singleton accuracy was lower by 7.3 points, and CSC was lower by 4.5 points; both safety intervals excluded zero.

**Answers.** PairRisk retains contradictory-view sensitivity, but it does not consistently produce safer singleton outputs than the stronger mean-score baseline. Relative to mean probability it improves throughput through smaller sets and more singleton yield. Relative to mean score it sacrifices singleton accuracy, CSC, and point-estimate SSY without a secure efficiency gain.

## 5. PairRisk versus LogMeanExp

The globally frozen deployment candidate remains tau=0.05. The nested comparison selected tau strictly within each outer training fold:

| Outer fold | Selected tau |
|---:|---:|
| 1 | 0.1 |
| 2 | 0.05 |
| 3 | 0.05 |
| 4 | 0.02 |
| 5 | 0.02 |

Selection frequency: tau=0.02: 2/5, tau=0.05: 2/5, tau=0.1: 1/5.

| Metric | PairRisk | Comparator | PairRisk - comparator | Paired 95% CI |
|---|---:|---:|---:|---:|
| Average set size | 2.392 | 2.351 | +0.041 | [-0.027, 0.105] |
| Coverage | 90.2% | 89.2% | +1.0 pp | [-1.0%, 3.0%] |
| Singleton rate | 26.0% | 28.0% | -2.0 pp | [-4.7%, 0.3%] |
| Singleton accuracy | 80.5% | 83.1% | -2.6 pp | [-7.6%, 2.1%] |
| CSC | 95.5% | 97.0% | -1.5 pp | [-6.1%, 2.4%] |
| SSY | 24.8% | 27.2% | -2.4 pp | [-4.7%, 0.0%] |

PairRisk used 0.041 more labels per lesion than nested LogMeanExp on the point estimate, but the paired interval for PairRisk minus nested LogMeanExp [-0.027, 0.105] crossed zero. Coverage, singleton rate, singleton accuracy, and CSC intervals also crossed zero. SSY favored nested LogMeanExp at the boundary of the interval.

**Answers.** Nested LogMeanExp does not conclusively dominate PairRisk, but neither are the data consistent with PairRisk dominance; they are approximately equivalent on efficiency and coverage, with a modest singleton-utility tilt toward nested LogMeanExp. PairRisk retains a meaningful Pareto position only through its substantially lower bag-size sensitivity, not through superior set efficiency.

## 6. View-count sensitivity

| True-label score | Spearman rho versus view count |
|---|---:|
| Mean probability | -0.035 |
| Mean APS score | 0.038 |
| Global LogMeanExp | 0.201 |
| PairRisk | 0.085 |
| Maximum | 0.322 |

The paired lesion bootstrap estimate for rho(maximum) minus rho(PairRisk) was 0.237, 95% CI [0.190, 0.292], with 2000/2000 valid replicates.

**Answers.** Maximum is substantially more sensitive to bag size. The positive paired interval is statistically stable. PairRisk reduces count sensitivity from rho=0.322 to rho=0.085; it reduces rather than eliminates sensitivity. Separate-correlation p-values are not used to test this difference.

## 7. Power and precision

| Target n | Relative effect | Estimated power | Median 95% CI width | Planning status |
|---:|---:|---:|---:|---|
| 350 | 2% | 24.8% | 0.169 | sensitivity scenario |
| 350 | 3% | 39.6% | 0.170 | sensitivity scenario |
| 350 | 5% | 79.6% | 0.170 | sensitivity scenario |
| 350 | 10% | 100.0% | 0.169 | sensitivity scenario |
| 493 | 2% | 24.0% | 0.144 | development-derived estimate |
| 493 | 3% | 51.2% | 0.144 | development-derived estimate |
| 493 | 5% | 86.8% | 0.144 | development-derived estimate |
| 493 | 10% | 100.0% | 0.144 | development-derived estimate |
| 650 | 2% | 35.6% | 0.125 | sensitivity scenario |
| 650 | 3% | 63.6% | 0.125 | sensitivity scenario |
| 650 | 5% | 97.2% | 0.126 | sensitivity scenario |
| 650 | 10% | 100.0% | 0.124 | sensitivity scenario |

Minimum grid effect with approximately 80% power: n=350: 5%; n=493: 5%; n=650: 5%. Effects of 2% and 3% remain underpowered at every planned sample size. The 5% scenario reaches 79.6%, 86.8%, and 97.2% power for n=350, 493, and 650, respectively.

**The value 493 is a development-derived planning estimate, not an observed final-test multi-view lesion count.**

## 8. Small-subgroup limits

### Aggregate multi-view bins

| Multi-view bin | Design lesions | Status |
|---|---:|---|
| 2 | 150 | adequate for aggregate description |
| 3 | 75 | adequate for aggregate description |
| 4+ | 71 | adequate for aggregate description |

### Design assignment cells by class and view bin

| Class | 1 view | 2 views | 3+ views |
|---|---:|---:|---:|
| AK | 4 (descriptive only) | 6 (descriptive only) | 5 (descriptive only) |
| BCC | 20 (descriptive only) | 28 (descriptive only) | 28 (descriptive only) |
| BKL | 43 | 19 (descriptive only) | 16 (descriptive only) |
| DF | 3 (descriptive only) | 1 (descriptive only) | 2 (descriptive only) |
| MEL | 24 (descriptive only) | 24 (descriptive only) | 28 (descriptive only) |
| NV | 270 | 67 | 61 |
| SCC | 10 (descriptive only) | 4 (descriptive only) | 5 (descriptive only) |
| VASC | 7 (descriptive only) | 1 (descriptive only) | 1 (descriptive only) |

Every cell with n<30 is explicitly marked descriptive only. These counts support no subgroup conformal-validity claim and no class-conditional validity claim. Even unmarked aggregate cells are descriptive design evidence, not confirmatory subgroup validation.

## 9. Decision

**`COUNT_SENSITIVITY_PAPER_GO`**

`FULL_PAIRRISK_GO` is rejected because the PairRisk-versus-maximum efficiency gain is only 3.0%, below the planned 5%, and its confidence interval crosses zero. `FALLBACK_MSP` is also rejected because the count-sensitivity reduction is large, paired, interval-supported, coherent across the ordered aggregators, and the 5% planning effect is adequately powered at n=493 and n=650. The evidence supports a comparison paper centered on how mean, fixed-order PairRisk, normalized smooth LogMeanExp, and variable-order maximum pooling respond to bag size and contradictory views.

This decision uses effect magnitude, paired intervals, nested LME, power, and scientific coherence; it is not based on one favorable point estimate.

## 10. Next-stage recommendation

- **Frozen narrative:** a count-sensitivity comparison of mean probability, mean APS score, fixed-order PairRisk, normalized smooth LogMeanExp, and variable-order maximum aggregation.
- **Methods proceeding to calibration:** mean probability, mean APS score, globally frozen LogMeanExp tau=0.05, PairRisk k=2, and maximum. Nested fold-specific LME is an evaluation device, not a calibration candidate.
- **Secondary analyses:** singleton utility/consistency, nested tau stability, view-bin descriptions, and class-by-view assignment counts.
- **Remaining limitation:** byte-level duplicate checking is incomplete because no local image root was available; it must be completed before publication claims are finalized.
- **Calibration implementation:** may begin under the frozen narrative and fixed method set, without revisiting alpha, PairRisk k, global tau, or lesion assignments. Calibration is not implemented by this report.
