/**
 * 练食AI · 高性能 Canvas 图表与缺口仪表盘绘制引擎
 */

const ChartEngine = {
  drawDeficitGauge(canvasId, currentDeficit, targetDeficit, totalBurn, totalIntake) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    
    const size = 140;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 56;
    const lineWidth = 8;

    ctx.clearRect(0, 0, size, size);

    // Background track ring (hairline matte)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Calculate ratio
    const ratio = targetDeficit > 0 ? Math.min(Math.max(currentDeficit / targetDeficit, 0), 1.5) : 0;
    const isTargetMet = currentDeficit >= targetDeficit && targetDeficit > 0;
    const isDeficit = currentDeficit >= 0;

    // Determine color
    let strokeColor = '#10b981'; // Lime
    if (!isDeficit) strokeColor = '#ef4444'; // Red surplus
    else if (!isTargetMet) strokeColor = '#f59e0b'; // Amber progressing

    // Foreground progress arc
    const startAngle = -Math.PI / 2;
    const sweepAngle = Math.min(ratio, 1.0) * Math.PI * 2;

    if (ratio > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sweepAngle);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }
  },

  drawDeficitTrend(canvasId, daysData, targetDeficit) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = canvas.parentElement.clientWidth || 340;
    const height = 180;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (!daysData || daysData.length === 0) return;

    const paddingLeft = 36;
    const paddingBottom = 28;
    const paddingTop = 20;
    const paddingRight = 16;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const maxDeficit = Math.max(...daysData.map(d => Math.max(d.deficit, targetDeficit, 600))) * 1.2;

    // Draw grid lines
    ctx.strokeStyle = '#23232a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = paddingTop + (chartHeight / 3) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      const labelVal = Math.round(maxDeficit - (maxDeficit / 3) * i);
      ctx.fillStyle = '#71717a';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(labelVal, paddingLeft - 6, y + 3);
    }

    // Draw Target Deficit Dashed Line
    const targetY = paddingTop + chartHeight * (1 - targetDeficit / maxDeficit);
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1;
    ctx.moveTo(paddingLeft, targetY);
    ctx.lineTo(width - paddingRight, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Bars
    const barWidth = Math.min(chartWidth / daysData.length - 8, 24);
    const step = chartWidth / daysData.length;

    daysData.forEach((day, index) => {
      const x = paddingLeft + index * step + (step - barWidth) / 2;
      const barH = (Math.max(day.deficit, 0) / maxDeficit) * chartHeight;
      const y = paddingTop + chartHeight - barH;

      // Color bar based on target
      ctx.fillStyle = day.deficit >= targetDeficit ? '#10b981' : '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [2, 2, 0, 0]);
      ctx.fill();

      // Date Label
      ctx.fillStyle = '#71717a';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(day.label || day.date.slice(5), x + barWidth / 2, height - 8);
    });
  },

  drawVolumeTrend(canvasId, daysData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = canvas.parentElement.clientWidth || 340;
    const height = 160;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (!daysData || daysData.length === 0) return;

    const paddingLeft = 40;
    const paddingBottom = 28;
    const paddingTop = 20;
    const paddingRight = 16;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const maxVol = Math.max(...daysData.map(d => d.volume || 1000), 2000) * 1.2;

    // Grid
    ctx.strokeStyle = '#23232a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = paddingTop + (chartHeight / 2) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      const labelVal = Math.round((maxVol - (maxVol / 2) * i) / 1000) + 't';
      ctx.fillStyle = '#71717a';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(labelVal, paddingLeft - 6, y + 3);
    }

    // Line curve
    const step = chartWidth / Math.max(daysData.length - 1, 1);
    ctx.beginPath();
    daysData.forEach((day, index) => {
      const x = paddingLeft + index * step;
      const y = paddingTop + chartHeight * (1 - (day.volume || 0) / maxVol);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = '#f4f4f5';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw dots
    daysData.forEach((day, index) => {
      const x = paddingLeft + index * step;
      const y = paddingTop + chartHeight * (1 - (day.volume || 0) / maxVol);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f4f4f5';
      ctx.fill();

      // Date Label
      ctx.fillStyle = '#71717a';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(day.label || day.date.slice(5), x, height - 8);
    });
  }
};
