const width = 960;
const height = 600;

const svg = d3.select("#map")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

const tooltip = d3.select("#tooltip");

// --- Line chart setup ---
const chartWidth = 700;
const chartHeight = 200;
const chartMargin = { top: 20, right: 40, bottom: 40, left: 60 };

const chartSvg = d3.select("#chart")
  .append("svg")
  .attr("width", chartWidth)
  .attr("height", chartHeight);

const chartArea = chartSvg.append("g")
  .attr("transform", `translate(${chartMargin.left},${chartMargin.top})`);

const xScale = d3.scalePoint().range([0, chartWidth - chartMargin.left - chartMargin.right]);
const yScale = d3.scaleLinear().range([chartHeight - chartMargin.top - chartMargin.bottom, 0]);

const lineGenerator = d3.line()
  .x(d => xScale(d["Year-Month"]))
  .y(d => yScale(d.value));

const chartTitle = d3.select("#chart-title");

Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
  d3.csv("data/modis_us_state_2024_2025_converted.csv")
]).then(([us, data]) => {

  // Parse numeric columns
  data.forEach(d => {
    d["Vegetation Index (NDVI)"] = +d["Vegetation Index (NDVI)"];
    d["Land Surface Temp (°F)"] = +d["Land Surface Temp (°F)"];
    d["Evapotranspiration (mm/day)"] = +d["Evapotranspiration (mm/day)"];
    const [year, month] = d["Year-Month"].split("-");
    d.year = +year;
    d.month = +month;
  });

  const variables = [
    "Vegetation Index (NDVI)",
    "Land Surface Temp (°F)",
    "Evapotranspiration (mm/day)"
  ];

  const colors = {
    "Vegetation Index (NDVI)": d3.schemeGreens[6],
    "Land Surface Temp (°F)": d3.schemeReds[6],
    "Evapotranspiration (mm/day)": d3.schemeBlues[6]
  };

  const variableSelect = d3.select("#variableSelect");
  variableSelect.selectAll("option")
    .data(variables)
    .enter().append("option")
    .text(d => d)
    .attr("value", d => d);

  let currentVariable = variables[0];

  const allMonths = Array.from(new Set(data.map(d => d["Year-Month"]))).sort();
  let currentMonthIndex = 0;

  const monthSlider = d3.select("#monthSlider")
    .attr("min", 0)
    .attr("max", allMonths.length - 1)
    .attr("value", currentMonthIndex);

  // Month formatting
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  function formatMonthLabel(ym) {
    const [year, month] = ym.split("-");
    return `${monthNames[+month - 1]} ${year}`;
  }

  const monthLabel = d3.select("#monthLabel");
  monthLabel.text(formatMonthLabel(allMonths[currentMonthIndex]));

  const projection = d3.geoAlbersUsa().scale(1000).translate([width / 2, height / 2]);
  const path = d3.geoPath(projection);
  const states = topojson.feature(us, us.objects.states).features;

  const valueExtent = {};
  variables.forEach(v => {
    valueExtent[v] = d3.extent(data, d => d[v]);
  });

  function getColor(val, variable) {
    const scale = d3.scaleQuantize()
      .domain(valueExtent[variable])
      .range(colors[variable]);
    return val != null ? scale(val) : "#444";
  }

  function drawLineChart(stateName) {
    const stateData = data
      .filter(d => d.State === stateName)
      .map(d => ({
        "Year-Month": d["Year-Month"],
        value: d[currentVariable]
      }))
      .sort((a, b) => d3.ascending(a["Year-Month"], b["Year-Month"]));

    if (stateData.length === 0) return;

    chartTitle.text(`${stateName} — ${currentVariable}`);

    xScale.domain(stateData.map(d => d["Year-Month"]));
    yScale.domain(d3.extent(stateData, d => d.value));

    chartArea.selectAll("*").remove();

    // X-axis
    chartArea.append("g")
      .attr("transform", `translate(0,${chartHeight - chartMargin.top - chartMargin.bottom})`)
      .call(d3.axisBottom(xScale)
        .tickValues(xScale.domain().filter((d, i) => i % 2 === 0))
        .tickFormat(d => {
          const [y, m] = d.split("-");
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          return monthNames[+m - 1] + " " + y.slice(2);
        }));

    // Y-axis
    chartArea.append("g")
      .call(d3.axisLeft(yScale).ticks(6));

    // Line
    chartArea.append("path")
      .datum(stateData)
      .attr("fill", "none")
      .attr("stroke", "#58a6ff")
      .attr("stroke-width", 2)
      .attr("d", lineGenerator);

    // Dots
    chartArea.selectAll(".dot")
      .data(stateData)
      .enter().append("circle")
      .attr("class", "dot")
      .attr("cx", d => xScale(d["Year-Month"]))
      .attr("cy", d => yScale(d.value))
      .attr("r", 3)
      .attr("fill", "#58a6ff");
  }

  function updateMap() {
    const month = allMonths[currentMonthIndex];
    const filtered = data.filter(d => d["Year-Month"] === month);
    const valueByState = {};
    filtered.forEach(d => valueByState[d.State] = d[currentVariable]);

    const paths = svg.selectAll("path").data(states);

    paths.enter()
      .append("path")
      .merge(paths)
      .attr("d", path)
      .attr("fill", d => getColor(valueByState[d.properties.name], currentVariable))
      .attr("stroke", "#222")
      .on("mousemove", (event, d) => {
        const stateName = d.properties.name;
        const val = valueByState[stateName];
        tooltip.transition().duration(100).style("opacity", 1);
        tooltip.html(`
          <b>${stateName}</b><br>
          ${currentVariable}: ${val !== undefined ? val.toFixed(2) : "N/A"}
        `)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 20) + "px");

        // Draw or update chart (persistent)
        drawLineChart(stateName);
      })
      .on("mouseout", () => {
        tooltip.transition().duration(200).style("opacity", 0);
      });

    paths.exit().remove();
    updateLegend();
  }

  function updateLegend() {
    const legend = d3.select("#legend");
    legend.selectAll("*").remove();

    const scale = d3.scaleQuantize()
      .domain(valueExtent[currentVariable])
      .range(colors[currentVariable]);

    const bins = scale.range().map(d => scale.invertExtent(d));

    legend.append("div")
      .attr("class", "legend-title")
      .text(currentVariable);

    bins.forEach((b, i) => {
      const item = legend.append("div").attr("class", "legend-item");
      item.append("div")
        .attr("class", "legend-color")
        .style("background-color", colors[currentVariable][i]);
      item.append("span")
        .text(`${b[0].toFixed(2)} – ${b[1].toFixed(2)}`);
    });
  }

  variableSelect.on("change", function() {
    currentVariable = this.value;
    updateMap();
  });

  monthSlider.on("input", function() {
    currentMonthIndex = +this.value;
    monthLabel.text(formatMonthLabel(allMonths[currentMonthIndex]));
    updateMap();
  });

  // --- Play Button (slow + smooth) ---
  let playing = false;
  let playInterval;

  d3.select("#playButton").on("click", function() {
    playing = !playing;
    d3.select(this).text(playing ? "Pause" : "Play");

    if (playing) {
      playInterval = setInterval(() => {
        currentMonthIndex = (currentMonthIndex + 1) % allMonths.length;
        monthSlider.property("value", currentMonthIndex);
        monthLabel.text(formatMonthLabel(allMonths[currentMonthIndex]));
        updateMap();
      }, 1000);
    } else {
      clearInterval(playInterval);
    }
  });

  updateMap();
});
