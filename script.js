// script.js
const width = 960;
const height = 600;

const svg = d3.select("#map")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

const tooltip = d3.select("#tooltip");

Promise.all([
  d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
  d3.csv("data/modis_us_state_2024_2025.csv")
]).then(([us, data]) => {

  // Convert numeric columns
  data.forEach(d => {
    d.value = +d.value; // or whatever your column for values is
    d.month = +d.month; // make sure this matches your CSV column
  });

  // Extract unique variables from the 'variable' column
  const variables = Array.from(new Set(data.map(d => d.variable))).sort();

  // Populate dropdown dynamically
  const variableSelect = d3.select("#variableSelect");
  variableSelect
    .selectAll("option")
    .data(variables)
    .enter()
    .append("option")
    .text(d => d)
    .attr("value", d => d);

  // Set default variable
  let currentVariable = variables[0];
  let currentMonth = 1;

  // Prepare color scale
  const color = d3.scaleSequential(d3.interpolateViridis);

  // Map projection and path
  const projection = d3.geoAlbersUsa().scale(1000).translate([width / 2, height / 2]);
  const path = d3.geoPath(projection);

  // Convert topojson to geojson
  const states = topojson.feature(us, us.objects.states).features;

  // Function to update map
  function updateMap() {
    const filtered = data.filter(d => d.variable === currentVariable && d.month === currentMonth);
    const valueByState = {};
    filtered.forEach(d => valueByState[d.State] = d.value);

    const values = Object.values(valueByState);
    if (values.length > 0) color.domain([d3.min(values), d3.max(values)]);

    const paths = svg.selectAll("path").data(states);

    paths.enter()
      .append("path")
      .merge(paths)
      .attr("d", path)
      .attr("fill", d => {
        const stateName = d.properties.name;
        const val = valueByState[stateName];
        return val ? color(val) : "#444";
      })
      .attr("stroke", "#222")
      .on("mousemove", (event, d) => {
        const stateName = d.properties.name;
        const val = valueByState[stateName];
        tooltip.transition().duration(100).style("opacity", 1);
        tooltip.html(`<b>${stateName}</b><br>${currentVariable}: ${val ? val.toFixed(2) : "N/A"}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 20) + "px");
      })
      .on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0));
  }

  // Dropdown change event
  variableSelect.on("change", function() {
    currentVariable = this.value;
    updateMap();
  });

  // Month slider event
  d3.select("#monthSlider").on("input", function() {
    currentMonth = +this.value;
    d3.select("#monthLabel").text("Month: " + currentMonth);
    updateMap();
  });

  // Initial map render
  updateMap();
});
