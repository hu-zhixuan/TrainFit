/**
 * 练食AI · 发丝级极简 Canvas 走势与仪表盘引擎
 */

const ChartEngine = {
  drawDeficitGauge(canvasId, deficit, targetDeficit, totalBurn, dietIntake) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = canvas.parentElement.clientWidth || 320;
    const height = 180;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2 + 6;
    const radius = 62;
    const lineWidth = 6;

    // Background track ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    const isSurplus = deficit < 0;
    const safeTarget = Math.max(targetDeficit, 1);
    const ratio = Math.max(0, Math.min(deficit / safeTarget, 1.0));
    const strokeColor = isSurplus ? '#ef4444' : (deficit >= targetDeficit ? '#10b981' : '#38bdf8');

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

    const paddingLeft = 38;
    const paddingBottom = 28;
    const paddingTop = 20;
    const paddingRight = 16;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const maxDeficit = Math.max(...daysData.map(d => Math.max(d.deficit || 0, targetDeficit, 600))) * 1.25;

    // Draw horizontal grid lines & Y-axis labels
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

    // Sample interval for dates to prevent horizontal overlapping on 30-day view
    const totalDays = daysData.length;
    const sampleStep = totalDays > 14 ? Math.ceil(totalDays / 5) : 1;
    const step = chartWidth / totalDays;
    const barWidth = Math.max(Math.min(step * 0.65, 18), 3.5);

    daysData.forEach((day, index) => {
      const x = paddingLeft + index * step + (step - barWidth) / 2;
      const barH = ((Math.max(day.deficit || 0, 0)) / maxDeficit) * chartHeight;
      const y = paddingTop + chartHeight - barH;

      // Draw Bar
      if (barH > 0) {
        ctx.fillStyle = (day.deficit >= targetDeficit) ? '#10b981' : '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, [2, 2, 0, 0]);
        ctx.fill();
      }

      // Sampled Date Labels (Avoid overlapping on 30-day views!)
      const isSampled = (index % sampleStep === 0) || (index === totalDays - 1);
      if (isSampled) {
        ctx.fillStyle = '#71717a';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(day.label || day.date.slice(5), x + barWidth / 2, height - 8);
      }
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

    const maxVol = Math.max(...daysData.map(d => d.volume || 0), 2000) * 1.25;

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

    const totalDays = daysData.length;
    const step = chartWidth / Math.max(totalDays - 1, 1);
    const sampleStep = totalDays > 14 ? Math.ceil(totalDays / 5) : 1;

    // Line curve
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

    // Draw dots & sampled labels
    daysData.forEach((day, index) => {
      const x = paddingLeft + index * step;
      const y = paddingTop + chartHeight * (1 - (day.volume || 0) / maxVol);

      // Only draw dots for tracked volume or sampled points
      if (day.volume > 0 || totalDays <= 7) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#f4f4f5';
        ctx.fill();
      }

      const isSampled = (index % sampleStep === 0) || (index === totalDays - 1);
      if (isSampled) {
        ctx.fillStyle = '#71717a';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(day.label || day.date.slice(5), x, height - 8);
      }
    });
  }
};
