const width = 850;
const height = 500;

const svg = d3.select("#map").append("svg").attr("width", width).attr("height", height);
const tooltip = d3.select("#tooltip");

const chartWidth = 700;
const chartHeight = 220;
const chartMargin = { top: 18, right: 30, bottom: 40, left: 60 };

const chartSvg = d3
  .select("#chart")
  .append("svg")
  .attr("width", chartWidth)
  .attr("height", chartHeight);

const chartArea = chartSvg
  .append("g")
  .attr("transform", `translate(${chartMargin.left},${chartMargin.top})`);

const innerW = chartWidth - chartMargin.left - chartMargin.right;
const innerH = chartHeight - chartMargin.top - chartMargin.bottom;

const xScale = d3.scalePoint().range([0, innerW]).padding(0.5);
let yScale = d3.scaleLinear().range([innerH, 0]);

const xAxisG = chartArea.append("g").attr("transform", `translate(0, ${innerH})`);
const yAxisG = chartArea.append("g");

const lineGenerator = d3
  .line()
  .defined(d => d.value != null)
  .x(d => xScale(d["Year-Month"]))
  .y(d => yScale(d.value));

const chartTitle = d3.select("#chart-title");
const chartInfoBox = d3.select("#chart-info-content");

// --- Tracker elements for highlighted point ---
const trackerGroup = chartArea.append("g").attr("class", "tracker");
const trackerDot = trackerGroup
  .append("circle")
  .attr("r", 5)
  .attr("fill", "#58a6ff")
  .attr("stroke", "#fff")
  .attr("stroke-width", 1.2)
  .style("filter", "drop-shadow(0 0 6px rgba(88,166,255,0.7))")
  .style("opacity", 0);

const trackerTooltip = d3
  .select("body")
  .append("div")
  .attr("class", "chart-tooltip")
  .style("position", "absolute")
  .style("pointer-events", "none")
  .style("opacity", 0);

// --- Custom bins (fixed) ---
const binsConfig = {
  "Land Surface Temp (°F)": {
    breaks: [20, 40, 60, 80, 100],
    domain: [0, 120], // make ticks easier to read
    tickStep: 20
  },
  "Vegetation Index (NDVI)": {
    breaks: [-0.5, 0.2, 0.4, 0.6, 0.7, 0.8],
    domain: [-0.6, 1.0], // make ticks easier to read
    tickStep: 0.1
  },
  "Evapotranspiration (mm/day)": {
    breaks: [2, 4, 6, 8, 10, 12.05],
    domain: [0, 12.05],
    tickStep: 2
  }
};

const colors = {
  "Vegetation Index (NDVI)": d3.schemeGreens[6],
  "Land Surface Temp (°F)": d3.schemeReds[6],
  "Evapotranspiration (mm/day)": d3.schemeBlues[6]
};

const monthNames = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
function formatMonthLabel(ym) {
  const [y, m] = ym.split("-");
  return `${monthNames[+m - 1]} ${y}`;
}

Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
  d3.csv("data/modis_us_state_2024_2025_converted.csv")
]).then(([us, data]) => {
  data.forEach(d => {
    d["Vegetation Index (NDVI)"] = +d["Vegetation Index (NDVI)"];
    d["Land Surface Temp (°F)"] = +d["Land Surface Temp (°F)"];
    d["Evapotranspiration (mm/day)"] = +d["Evapotranspiration (mm/day)"];
  });

  const variables = Object.keys(binsConfig);
  const variableSelect = d3.select("#variableSelect");
  variableSelect.selectAll("option").data(variables).enter().append("option").text(d => d);

  let currentVariable = variables[0];
  const allMonths = Array.from(new Set(data.map(d => d["Year-Month"]))).sort();
  let currentMonthIndex = 0;

  const monthSlider = d3
    .select("#monthSlider")
    .attr("min", 0)
    .attr("max", allMonths.length - 1)
    .attr("value", 0);

  d3.select("#monthLabel").text(formatMonthLabel(allMonths[0]));

  const projection = d3.geoAlbersUsa().scale(1000).translate([width / 2, height / 2]);
  const path = d3.geoPath(projection);
  const states = topojson.feature(us, us.objects.states).features;

  const colorScales = {};
  Object.keys(binsConfig).forEach(v => {
    colorScales[v] = d3.scaleThreshold().domain(binsConfig[v].breaks).range(colors[v]);
  });

  const domainsByVar = {};
  Object.keys(binsConfig).forEach(v => {
    domainsByVar[v] = binsConfig[v].domain;
  });

  xScale.domain(allMonths);
  yScale.domain(domainsByVar[currentVariable]);

  function drawAxesForVariable(variable) {
    const cfg = binsConfig[variable];
    const domain = cfg.domain;
    yScale.domain(domain);

    let ticks = cfg.tickStep >= 1
  ? d3.range(Math.ceil(domain[0]), Math.floor(domain[1]) + 1, cfg.tickStep)
  : d3.range(domain[0], domain[1] + cfg.tickStep, cfg.tickStep);

if (variable === "Vegetation Index (NDVI)") {
  ticks = ticks.filter((_, i) => i % 2 === 0);
}

yAxisG.call(
  d3.axisLeft(yScale)
    .tickValues(ticks)
    .tickFormat(d => (cfg.tickStep < 1 ? d.toFixed(1) : d))
);


    xAxisG.call(
      d3.axisBottom(xScale)
        .tickValues(xScale.domain().filter((d, i) => i % 2 === 0))
        .tickFormat(d => {
          const [y, m] = d.split("-");
          const short = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          return `${short[+m - 1]} '${y.slice(2)}`;
        })
    );
  }

  function updateLegend(variable) {
    const legend = d3.select("#legend");
    legend.selectAll("*").remove();

    const cfg = binsConfig[variable];
    const pal = colors[variable];

    legend.append("div").attr("class", "legend-title").text(variable);

    const breaks = cfg.breaks;
    const labels = [];
    if (breaks.length > 0) {
      labels.push(`< ${breaks[0]}`);
      for (let i = 0; i < breaks.length - 1; i++) labels.push(`${breaks[i]} – ${breaks[i + 1]}`);
      labels.push(`${breaks[breaks.length - 1]} – ${cfg.domain[1]}`);
    }

    labels.forEach((lab, i) => {
      const item = legend.append("div").attr("class", "legend-item");
      item.append("div").attr("class", "legend-color").style("background-color", pal[i]);
      item.append("span").text(lab);
    });
  }

  function updateMap() {
    const month = allMonths[currentMonthIndex];
    const filtered = data.filter(d => d["Year-Month"] === month);
    const valueByState = {};
    filtered.forEach(d => (valueByState[d.State] = d[currentVariable]));

    const paths = svg.selectAll("path").data(states);

    paths
      .enter()
      .append("path")
      .merge(paths)
      .attr("d", path)
      .attr("fill", d => {
        const v = valueByState[d.properties.name];
        return v != null ? colorScales[currentVariable](v) : "#444";
      })
      .attr("stroke", "#222")
      .on("mousemove", (e, d) => {
        const name = d.properties.name;
        const v = valueByState[name];
        tooltip.style("opacity", 1).html(`<b>${name}</b><br>${currentVariable}: ${v?.toFixed(2) ?? "N/A"}`)
          .style("left", e.pageX + 10 + "px").style("top", e.pageY - 20 + "px");
      })
      .on("mouseout", () => tooltip.style("opacity", 0))
      .on("click", (e, d) => {
        const name = d.properties.name;
        lockedState = lockedState === name ? null : name;
        if (lockedState) drawLineChart(lockedState);
        else clearChart();
      });

    paths.exit().remove();
    updateLegend(currentVariable);
  }

  let lockedState = null;
  
  function drawLineChart(state) {
    const stateData = data
      .filter(d => d.State === state)
      .map(d => ({ "Year-Month": d["Year-Month"], value: d[currentVariable] }))
      .sort((a, b) => (a["Year-Month"] > b["Year-Month"] ? 1 : -1));

    drawAxesForVariable(currentVariable);
    chartTitle.text(`${state} — ${currentVariable}`);

    chartArea.selectAll(".state-line").data([stateData]).join("path")
      .attr("class", "state-line").attr("fill", "none")
      .attr("stroke", "#58a6ff").attr("stroke-width", 2)
      .attr("d", lineGenerator);

    chartArea.selectAll(".dot").data(stateData.filter(d => d.value != null)).join("circle")
      .attr("class", "dot").attr("r", 3).attr("fill", "#58a6ff")
      .attr("cx", d => xScale(d["Year-Month"]))
      .attr("cy", d => yScale(d.value));

    updateTrackerToMonth(currentMonthIndex, stateData, true);
    updateInfoBox(stateData[stateData.length - 1], state);
  }

  function updateTrackerToMonth(monthIdx, stateData, instant = false) {
    if (!stateData || stateData.length === 0) {
      trackerDot.style("opacity", 0);
      trackerTooltip.style("opacity", 0);
      return;
    }

    const monthKey = allMonths[monthIdx];
    const point = stateData.find(d => d["Year-Month"] === monthKey);
    if (!point || point.value == null) {
      trackerDot.transition().duration(200).style("opacity", 0);
      trackerTooltip.transition().duration(200).style("opacity", 0);
      return;
    }

    const x = chartMargin.left + xScale(point["Year-Month"]);
    const y = chartMargin.top + yScale(point.value);

    const t = instant ? d3.transition().duration(0) : d3.transition().duration(100).ease(d3.easeCubic);
    trackerDot
      .transition(t)
      .style("opacity", 1)
      .attr("cx", x - chartMargin.left)
      .attr("cy", y - chartMargin.top);

    // const tooltipHtml = `${formatMonthLabel(point["Year-Month"])} — ${currentVariable}: ${point.value.toFixed(2)}`;

    // const chartRect = chartSvg.node().getBoundingClientRect();
    // const pageX = chartRect.left + x;
    // const pageY = chartRect.top + y;

    // trackerTooltip
    //   .html(tooltipHtml)
    //   .style("left", pageX - trackerTooltip.node().offsetWidth / 2 + "px")
    //   .style("top", pageY - trackerTooltip.node().offsetHeight - 12 + "px");

    // trackerTooltip.transition(t).style("opacity", 1);
  }

  function updateInfoBox(point, state) {
    if (!point) return;
    chartInfoBox.html(`
      <b>State:</b> ${state}<br>
      <b>Month:</b> ${formatMonthLabel(allMonths[currentMonthIndex])}<br>
      <b>Variable:</b> ${currentVariable}<br>
      <b>Value:</b> ${point.value?.toFixed(2) ?? "N/A"}
    `);
  }

  function clearChart() {
    chartArea.selectAll(".state-line, .dot").remove();
    chartTitle.text("No State Selected");
    chartInfoBox.text("Click a state to view details");
    trackerDot.style("opacity", 0);
    trackerTooltip.style("opacity", 0);
  }

  function onMonthChange() {
  d3.select("#monthLabel").text(formatMonthLabel(allMonths[currentMonthIndex]));
  updateMap();

  if (lockedState) {
    const stateData = data
      .filter(d => d.State === lockedState)
      .map(d => ({ "Year-Month": d["Year-Month"], value: d[currentVariable] }))
      .sort((a, b) => (a["Year-Month"] > b["Year-Month"] ? 1 : -1));

    updateTrackerToMonth(currentMonthIndex, stateData, false);
    const currentPoint = stateData.find(d => d["Year-Month"] === allMonths[currentMonthIndex]);
    updateInfoBox(currentPoint, lockedState);
  }
}


  monthSlider.on("input", function() {
    currentMonthIndex = +this.value;
    onMonthChange();
  });

  variableSelect.on("change", function() {
    currentVariable = this.value;
    drawAxesForVariable(currentVariable);
    updateLegend(currentVariable);
    updateMap();
    if (lockedState) drawLineChart(lockedState);
  });

  let playing = false;
  let playInterval;
  d3.select("#playButton").on("click", function() {
    playing = !playing;
    d3.select(this).text(playing ? "Pause" : "Play");
    if (playing) {
      playInterval = setInterval(() => {
        currentMonthIndex = (currentMonthIndex + 1) % allMonths.length;
        monthSlider.property("value", currentMonthIndex);
        onMonthChange();
      }, 1000);
    } else clearInterval(playInterval);
  });

  drawAxesForVariable(currentVariable);
  updateLegend(currentVariable);
  updateMap();
});