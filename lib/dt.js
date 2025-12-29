function renderDataTable(cellData) {
    console.log('renderDataTable called with cellData:', cellData);

    let mydata = [];
    let mydata2 = [];

    // Prepare gene expression data
    if (cellData.Genenames && cellData.CellGeneCount) {
        const n = d3.max([cellData.CellGeneCount.length, cellData.Genenames.length]) || 0;
        for (let i = 0; i < n; i++) {
            const count = cellData.CellGeneCount[i];
            mydata.push({
                Genenames: cellData.Genenames[i] ?? '',
                CellGeneCount: count === undefined ? '' : +Number(count).toFixed(2),
            });
        }
    }

    // Prepare cell classification data
    if (cellData.ClassName && cellData.Prob) {
        const n = d3.max([cellData.ClassName.length, cellData.Prob.length]) || 0;
        for (let i = 0; i < n; i++) {
            const prob = Array.isArray(cellData.Prob) ? cellData.Prob[i] : cellData.Prob;
            mydata2.push({
                ClassName: cellData.ClassName[i] ?? '',
                Prob: prob === undefined ? '' : prob,
            });
        }
    }

    // Sort data descending by value for readability
    mydata.sort((a, b) => (b.CellGeneCount || 0) - (a.CellGeneCount || 0));
    mydata2.sort((a, b) => (b.Prob || 0) - (a.Prob || 0));

    const dtAvailable = !!(window.jQuery && $.fn && ($.fn.dataTable || $.fn.DataTable));

    let total = 0;

    if (dtAvailable) {
        // Gene expression table
        let table;
        if ($.fn.dataTable.isDataTable('#dtTable')) {
            table = $('#dtTable').DataTable();
            table.clear().rows.add(mydata).draw();
        } else {
            table = $('#dtTable').DataTable({
                lengthChange: false,
                searching: false,
                paging: false,
                bInfo: false,
                bPaginate: false,
                data: mydata,
                columns: [
                    { title: 'Gene', data: 'Genenames' },
                    { title: 'Counts', data: 'CellGeneCount' },
                ],
            });
        }

        // Cell classification table
        let table2;
        if ($.fn.dataTable.isDataTable('#dtTable2')) {
            table2 = $('#dtTable2').DataTable();
            table2.clear().rows.add(mydata2).draw();
        } else {
            table2 = $('#dtTable2').DataTable({
                lengthChange: false,
                searching: false,
                paging: false,
                bInfo: false,
                bPaginate: false,
                data: mydata2,
                columns: [
                    { title: 'Class Name', data: 'ClassName' },
                    { title: 'Prob', data: 'Prob' },
                ],
            });
        }

        // Sort by counts/probability (descending)
        table.order([1, 'desc']).draw();
        table2.order([1, 'desc']).draw();

        // Compute total from DataTables data
        try {
            total = table.column(1).data().reduce(function (a, b) { return (a || 0) + (b || 0); }, 0) || 0;
        } catch (e) {
            total = mydata.reduce((acc, r) => acc + (r.CellGeneCount || 0), 0);
        }
    } else {
        // Fallback: render plain tables without DataTables dependency
        const dt = document.getElementById('dtTable');
        const dt2 = document.getElementById('dtTable2');
        if (dt) {
            dt.innerHTML = '';
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>Gene</th><th>Counts</th></tr>';
            dt.appendChild(thead);
            const tbody = document.createElement('tbody');
            mydata.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${row.Genenames}</td><td>${row.CellGeneCount}</td>`;
                tbody.appendChild(tr);
            });
            dt.appendChild(tbody);
        }
        if (dt2) {
            dt2.innerHTML = '';
            const thead2 = document.createElement('thead');
            thead2.innerHTML = '<tr><th>Class Name</th><th>Prob</th></tr>';
            dt2.appendChild(thead2);
            const tbody2 = document.createElement('tbody');
            mydata2.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${row.ClassName}</td><td>${row.Prob}</td>`;
                tbody2.appendChild(tr);
            });
            dt2.appendChild(tbody2);
        }
        total = mydata.reduce((acc, r) => acc + (r.CellGeneCount || 0), 0);
    }

    // Update cell info header
    const cellNum = cellData.cell_id || cellData.Cell_Num || 'Unknown';
    const x = cellData.centroid ? Number(cellData.centroid[0]).toFixed(0) : Number(cellData.x || 0).toFixed(0);
    const y = cellData.centroid ? Number(cellData.centroid[1]).toFixed(0) : Number(cellData.y || 0).toFixed(0);

    const str = '<b><strong>Cell Num: </strong>' + cellNum
        + ', <strong>Gene Counts: </strong>' + Number(total).toFixed(0)
        + ',  (<strong>x, y</strong>): (' + x + ', ' + y + ')</b>';

    const titleElement = document.getElementById('cellInfoTitle');
    if (titleElement) {
        titleElement.innerHTML = str;
    }
}

// Simplified version for mouseover updates
function updateCellInfo(cellData) {
    try {
        // Update donut chart first; it should not depend on DataTables
        if (cellData.ClassName && cellData.Prob && typeof donutchart !== 'undefined') {
            donutchart(cellData);
        }
    } catch (e) {
        console.warn('Donut update failed:', e);
    }
    try {
        // Update data tables (with graceful fallback if DataTables missing)
        renderDataTable(cellData);
    } catch (e) {
        console.warn('DataTable update failed:', e);
    }
}
