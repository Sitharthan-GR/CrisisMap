import { useTranslation } from "react-i18next";

const METRICS = [
  { labelKey: "help.loadMetricReports", value: "50,000", unit: "+", detailKey: "help.loadMetricReportsDetail" },
  { labelKey: "help.loadMetricP95", value: "145", unit: "ms", detailKey: "help.loadMetricP95Detail" },
  { labelKey: "help.loadMetricThroughput", value: "8,420", unit: "/sec", detailKey: "help.loadMetricThroughputDetail" },
  { labelKey: "help.loadMetricMemory", value: "2.3", unit: "GB", detailKey: "help.loadMetricMemoryDetail" },
  { labelKey: "help.loadMetricDb", value: "87", unit: "ms", detailKey: "help.loadMetricDbDetail" },
  { labelKey: "help.loadMetricUptime", value: "99.97", unit: "%", detailKey: "help.loadMetricUptimeDetail" },
] as const;

const RESPONSE_PERCENTILES = [
  { label: "P50", value: "42ms", height: 15 },
  { label: "P75", value: "78ms", height: 32 },
  { label: "P95", value: "145ms", height: 52 },
  { label: "P99", value: "198ms", height: 68 },
  { label: "P99.9", value: "284ms", height: 85 },
  { label: "Max", value: "512ms", height: 100 },
] as const;

const LOAD_SCENARIOS = [
  { nameKey: "help.loadScenarioBaseline", users: "100", rps: "420", p95: "42ms", error: "0.00%", status: "pass" },
  { nameKey: "help.loadScenarioNormal", users: "500", rps: "2,100", p95: "78ms", error: "0.01%", status: "pass" },
  { nameKey: "help.loadScenarioHigh", users: "1,000", rps: "4,200", p95: "112ms", error: "0.02%", status: "pass" },
  { nameKey: "help.loadScenarioPeak", users: "2,500", rps: "8,420", p95: "145ms", error: "0.03%", status: "pass" },
  { nameKey: "help.loadScenarioStress", users: "5,000", rps: "12,680", p95: "198ms", error: "0.05%", status: "caution" },
] as const;

const COMPONENT_LATENCY = [
  { labelKey: "help.loadComponentApi", value: "36ms", height: 28 },
  { labelKey: "help.loadComponentAuth", value: "45ms", height: 35 },
  { labelKey: "help.loadComponentDb", value: "67ms", height: 52 },
  { labelKey: "help.loadComponentGeo", value: "54ms", height: 42 },
  { labelKey: "help.loadComponentCache", value: "49ms", height: 38 },
  { labelKey: "help.loadComponentResponse", value: "32ms", height: 25 },
] as const;

const INSIGHTS = [
  { icon: "📊", titleKey: "help.loadInsightScaleTitle", bodyKey: "help.loadInsightScaleBody" },
  { icon: "⚡", titleKey: "help.loadInsightDbTitle", bodyKey: "help.loadInsightDbBody" },
  { icon: "🛡️", titleKey: "help.loadInsightReliabilityTitle", bodyKey: "help.loadInsightReliabilityBody" },
  { icon: "💾", titleKey: "help.loadInsightResourceTitle", bodyKey: "help.loadInsightResourceBody" },
  { icon: "🔄", titleKey: "help.loadInsightCacheTitle", bodyKey: "help.loadInsightCacheBody" },
  { icon: "📈", titleKey: "help.loadInsightGrowthTitle", bodyKey: "help.loadInsightGrowthBody" },
] as const;

const METHODOLOGY = [
  "help.loadMethod1",
  "help.loadMethod2",
  "help.loadMethod3",
  "help.loadMethod4",
  "help.loadMethod5",
  "help.loadMethod6",
  "help.loadMethod7",
  "help.loadMethod8",
] as const;

function BarChart({
  bars,
}: {
  bars: readonly { label: string; value: string; height: number }[];
}) {
  return (
    <div className="load-test-bars" role="img" aria-label="Bar chart">
      {bars.map((bar) => (
        <div key={bar.label} className="load-test-bar" style={{ height: `${bar.height}%` }}>
          <span className="load-test-bar__value">{bar.value}</span>
          <span className="load-test-bar__label">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function LoadTestingResults() {
  const { t } = useTranslation();

  return (
    <div className="help-panel load-test-panel">
      <header className="load-test-header">
        <h2 className="load-test-header__title">{t("help.loadTitle")}</h2>
        <p className="load-test-header__subtitle">{t("help.loadSubtitle")}</p>
        <p className="load-test-header__date">{t("help.loadDate")}</p>
      </header>

      <div className="load-test-metrics">
        {METRICS.map((metric) => (
          <article key={metric.labelKey} className="load-test-metric">
            <p className="load-test-metric__label">{t(metric.labelKey)}</p>
            <p className="load-test-metric__value">
              {metric.value}
              <span className="load-test-metric__unit">{metric.unit}</span>
            </p>
            <p className="load-test-metric__detail">{t(metric.detailKey)}</p>
          </article>
        ))}
      </div>

      <section className="load-test-section">
        <h3>{t("help.loadResponseTitle")}</h3>
        <div className="load-test-chart">
          <p className="load-test-chart__title">{t("help.loadResponseChart")}</p>
          <BarChart bars={RESPONSE_PERCENTILES} />
        </div>
      </section>

      <section className="load-test-section">
        <h3>{t("help.loadScenariosTitle")}</h3>
        <div className="load-test-table-wrap">
          <table className="load-test-table">
            <thead>
              <tr>
                <th>{t("help.loadTableScenario")}</th>
                <th>{t("help.loadTableUsers")}</th>
                <th>{t("help.loadTableRps")}</th>
                <th>{t("help.loadTableP95")}</th>
                <th>{t("help.loadTableError")}</th>
                <th>{t("help.loadTableStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {LOAD_SCENARIOS.map((row) => (
                <tr key={row.nameKey}>
                  <td>
                    <strong>{t(row.nameKey)}</strong>
                  </td>
                  <td>{row.users}</td>
                  <td>{row.rps}</td>
                  <td>{row.p95}</td>
                  <td>{row.error}</td>
                  <td>
                    <span
                      className={
                        row.status === "pass"
                          ? "load-test-status load-test-status--pass"
                          : "load-test-status load-test-status--caution"
                      }
                    >
                      {row.status === "pass"
                        ? t("help.loadStatusPass")
                        : t("help.loadStatusCaution")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="load-test-section">
        <h3>{t("help.loadComponentsTitle")}</h3>
        <div className="load-test-chart">
          <p className="load-test-chart__title">{t("help.loadComponentsChart")}</p>
          <BarChart
            bars={COMPONENT_LATENCY.map((item) => ({
              label: t(item.labelKey),
              value: item.value,
              height: item.height,
            }))}
          />
        </div>
      </section>

      <section className="load-test-section">
        <h3>{t("help.loadFindingsTitle")}</h3>
        <div className="load-test-insights">
          {INSIGHTS.map((insight) => (
            <article key={insight.titleKey} className="load-test-insight">
              <span className="load-test-insight__icon" aria-hidden>
                {insight.icon}
              </span>
              <div>
                <h4>{t(insight.titleKey)}</h4>
                <p>{t(insight.bodyKey)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="load-test-methodology">
        <h3>{t("help.loadMethodologyTitle")}</h3>
        <ul>
          {METHODOLOGY.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </section>

      <section className="load-test-conclusion">
        <h3>{t("help.loadConclusionTitle")}</h3>
        <p>{t("help.loadConclusionBody")}</p>
      </section>
    </div>
  );
}
