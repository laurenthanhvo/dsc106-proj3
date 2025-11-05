const width = 960;
const height = 600;


const svg = d3.select("#map")
 .append("svg")
 .attr("width", width)
 .attr("height", height);


const tooltip = d3.select("#tooltip");
const legendContainer = d3.select("#legend");


let playInterval = null;
let isPlaying = false;
const playDelayMs = 1000; // 1 second per step


Promise.all([
 d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
 d3.csv("data/modis_us_state_2024_2025.csv")
]).then(([us, data]) => {


 // Convert and clean data
 data.forEach(d => {
   d.Average_Value = +d.Average_Value;
   d.Month = +d.Month;
   d.Year = +d.Year;
 });


 const variables = Array.from(new Set(data.map(d => d.Variable))).sort();


 // Units for variables
 const units = {
   "Vegetation Index (NDVI)": "NDVI",
   "Evapotranspiration (mm/day)": "mm/day",
   "Land Surface Temp (°C)": "°C"
 };


 // Populate dropdown
 const variableSelect = d3.select("#variableSelect");
 variableSelect
   .selectAll("option")
   .data(variables)
   .enter()
   .append("option")
   .text(d => d)
   .attr("value", d => d);


 // Build sorted list of all unique (Year, Month) pairs
 const timeSteps = Array.from(
   new Set(data.map(d => `${d.Year}-${String(d.Month).padStart(2, "0")}`))
 ).sort();


 let currentVariable = variables[0];
 let currentIndex = 0;


 const color = d3.scaleSequential(d3.interpolateViridis);


 const projection = d3.geoAlbersUsa()
   .scale(1000)
   .translate([width / 2, height / 2]);


 const path = d3.geoPath(projection);
 const states = topojson.feature(us, us.objects.states).features;


 // Slider setup (STATIC)
 const slider = d3.select("#monthSlider")
   .attr("min", 0)
   .attr("max", timeSteps.length - 1)
   .attr("value", 0)
   .style("width", "300px");


 function getMonthYearLabel(step) {
   const [year, month] = step.split("-");
   const monthNames = [
     "January", "February", "March", "April", "May", "June",
     "July", "August", "September", "October", "November", "December"
   ];
   return `${monthNames[+month - 1]} ${year}`;
 }


 // ✅ Precompute global min and max per variable (for consistent legend)
 const globalRanges = {};
 variables.forEach(v => {
   const vals = data.filter(d => d.Variable === v).map(d => d.Average_Value);
   globalRanges[v] = [d3.min(vals), d3.max(vals)];
 });


 function updateLegend(min, max) {
   legendContainer.html("");


   const legendSvg = legendContainer.append("svg")
     .attr("width", 360)
     .attr("height", 60);


   const defs = legendSvg.append("defs");
   const gradient = defs.append("linearGradient")
     .attr("id", "legend-gradient");


   const stops = d3.range(0, 1.01, 0.1);
   stops.forEach(s => {
     gradient.append("stop")
       .attr("offset", `${s * 100}%`)
       .attr("stop-color", color(s * (max - min) + min));
   });


   legendSvg.append("rect")
     .attr("x", 30)
     .attr("y", 15)
     .attr("width", 300)
     .attr("height", 15)
     .style("fill", "url(#legend-gradient)")
     .attr("rx", 4);


   legendSvg.append("text")
     .attr("x", 30)
     .attr("y", 50)
     .attr("fill", "#ccc")
     .attr("font-size", 12)
     .text(`${min.toFixed(2)}`);


   legendSvg.append("text")
     .attr("x", 320)
     .attr("y", 50)
     .attr("fill", "#ccc")
     .attr("font-size", 12)
     .attr("text-anchor", "end")
     .text(`${max.toFixed(2)} ${units[currentVariable] || ""}`);


   legendSvg.append("text")
     .attr("x", 180)
     .attr("y", 10)
     .attr("text-anchor", "middle")
     .attr("fill", "#58a6ff")
     .attr("font-size", 13)
     .text(`${currentVariable} ${units[currentVariable] ? `(${units[currentVariable]})` : ""}`);
 }


 function updateMap() {
   const [year, monthStr] = timeSteps[currentIndex].split("-");
   const month = +monthStr;


   const filtered = data.filter(d =>
     d.Variable === currentVariable &&
     d.Year === +year &&
     d.Month === month
   );


   const valueByState = {};
   filtered.forEach(d => {
     valueByState[d.State] = d.Average_Value;
   });


   // ✅ Use global min/max for the selected variable
   const [globalMin, globalMax] = globalRanges[currentVariable];
   color.domain([globalMin, globalMax]);
   updateLegend(globalMin, globalMax);


   const paths = svg.selectAll("path").data(states);


   paths.enter()
     .append("path")
     .merge(paths)
     .attr("d", path)
     .attr("fill", d => {
       const val = valueByState[d.properties.name];
       return val !== undefined && !isNaN(val) ? color(val) : "#333";
     })
     .attr("stroke", "#111")
     .on("mousemove", (event, d) => {
       const stateName = d.properties.name;
       const stats = data.filter(x =>
         x.State === stateName && x.Year === +year && x.Month === month
       );


       let html = `<b>${stateName}</b><br>${getMonthYearLabel(timeSteps[currentIndex])}<br>`;
       if (stats.length > 0) {
         stats.forEach(s => {
           html += `${s.Variable}: ${s.Average_Value.toFixed(2)} ${units[s.Variable] || ""}<br>`;
         });
       } else {
         html += "No data";
       }


       tooltip.style("opacity", 1)
         .html(html)
         .style("left", (event.pageX + 10) + "px")
         .style("top", (event.pageY - 20) + "px");
     })
     .on("mouseout", () => tooltip.style("opacity", 0));


   d3.select("#monthLabel").text(getMonthYearLabel(timeSteps[currentIndex]));
   slider.property("value", currentIndex);
 }


 // Play/pause controls
 const playPauseBtn = d3.select("#playPauseBtn");
 function startPlay() {
   if (isPlaying) return;
   isPlaying = true;
   playPauseBtn.text("⏸ Pause").attr("title", "Pause");
   playInterval = setInterval(() => {
     currentIndex = (currentIndex + 1) % timeSteps.length;
     updateMap();
   }, playDelayMs);
 }
 function stopPlay() {
   isPlaying = false;
   playPauseBtn.text("▶ Play").attr("title", "Play");
   if (playInterval) {
     clearInterval(playInterval);
     playInterval = null;
   }
 }
 playPauseBtn.on("click", () => {
   if (isPlaying) stopPlay(); else startPlay();
 });


 variableSelect.on("change", function () {
   currentVariable = this.value;
   updateMap();
 });


 slider.on("input", function () {
   currentIndex = +this.value;
   updateMap();
 });


 // initial render
 updateMap();
});
