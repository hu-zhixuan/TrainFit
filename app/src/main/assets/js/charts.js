/**
 * 练食AI · 发丝级极简 Canvas 走势、仪表盘与历史回溯动画引擎
 */

const ChartEngine = {
  drawDeficitGauge(canvasId, deficit, targetDeficit, totalBurn, dietIntake) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = 130;
    const height = 130;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 54;
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
    const strokeColor = isSurplus ? '#ef4444' : (deficit >= targetDeficit && targetDeficit > 0 ? '#10b981' : '#38bdf8');

    // Foreground progress arc
    const startAngle = -Math.PI / 2;
    const sweepAngle = Math.min(ratio, 1.0) * Math.PI * 2;

    if (ratio > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sweepAngle);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  },

  drawRetrospectiveRing(canvasId, deficit, targetDeficit) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = 100;
    const height = 100;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 40;
    const lineWidth = 5;

    // Track
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#222228';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    const isSurplus = deficit < 0;
    const safeTarget = Math.max(targetDeficit, 1);
    const ratio = Math.max(0, Math.min(deficit / safeTarget, 1.0));
    const strokeColor = isSurplus ? '#ef4444' : (deficit >= targetDeficit && targetDeficit > 0 ? '#10b981' : '#38bdf8');

    const startAngle = -Math.PI / 2;
    const sweepAngle = Math.min(ratio, 1.0) * Math.PI * 2;

    if (ratio > 0) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sweepAngle);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  },

  drawDeficitTrend(canvasId, daysData, targetDeficit) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = canvas.parentElement.clientWidth || 340;
    const height = 170;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (!daysData || daysData.length === 0) return;

    const paddingLeft = 38;
    const paddingBottom = 26;
    const paddingTop = 18;
    const paddingRight = 14;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const maxVal = Math.max(...daysData.map(d => d.deficit || 0), targetDeficit, 500);
    const minVal = Math.min(...daysData.map(d => d.deficit || 0), 0);

    const upperLimit = Math.max(maxVal * 1.25, 600);
    const lowerLimit = minVal < -50 ? Math.min(minVal * 1.25, -400) : 0;
    const totalRange = upperLimit - lowerLimit;

    const getY = (val) => {
      return paddingTop + chartHeight * (1 - (val - lowerLimit) / totalRange);
    };

    const yZero = getY(0);

    // Horizontal grid lines & Y-axis labels
    const gridSteps = lowerLimit < 0 ? 4 : 3;
    ctx.strokeStyle = '#23232a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridSteps; i++) {
      const val = upperLimit - (totalRange / gridSteps) * i;
      const y = getY(val);

      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();

      ctx.fillStyle = '#71717a';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(val), paddingLeft - 6, y + 3);
    }

    // 0-Baseline
    if (lowerLimit < 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 1.2;
      ctx.moveTo(paddingLeft, yZero);
      ctx.lineTo(width - paddingRight, yZero);
      ctx.stroke();
    }

    // Target Deficit Dashed Line
    const targetY = getY(targetDeficit);
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1;
    ctx.moveTo(paddingLeft, targetY);
    ctx.lineTo(width - paddingRight, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    const totalDays = daysData.length;
    const sampleStep = totalDays > 14 ? Math.ceil(totalDays / 5) : 1;
    const step = chartWidth / totalDays;
    const barWidth = Math.max(Math.min(step * 0.65, 18), 3.5);

    daysData.forEach((day, index) => {
      const val = day.deficit || 0;
      const x = paddingLeft + index * step + (step - barWidth) / 2;

      // Positive Deficit -> Bar goes UPWARDS
      if (val > 0) {
        const y = getY(val);
        const barH = Math.max(yZero - y, 2);
        ctx.fillStyle = val >= targetDeficit ? '#10b981' : '#38bdf8';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barH, [2, 2, 0, 0]);
        } else {
          ctx.rect(x, y, barWidth, barH);
        }
        ctx.fill();
      }
      // Negative Deficit (Surplus) -> Bar goes DOWNWARDS
      else if (val < 0) {
        const y = getY(val);
        const barH = Math.max(y - yZero, 2);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, yZero, barWidth, barH, [0, 0, 2, 2]);
        } else {
          ctx.rect(x, yZero, barWidth, barH);
        }
        ctx.fill();
      }

      // Date labels
      const isSampled = (index % sampleStep === 0) || (index === totalDays - 1);
      if (isSampled) {
        ctx.fillStyle = '#71717a';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(day.label || day.date.slice(5), x + barWidth / 2, height - 6);
      }
    });

    // Attach click handler for interactive day retrospective
    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX >= paddingLeft && clickX <= width - paddingRight) {
        const clickedIdx = Math.floor((clickX - paddingLeft) / step);
        if (daysData[clickedIdx] && window.app && window.app.openDayRetrospective) {
          window.app.openDayRetrospective(daysData[clickedIdx].date);
        }
      }
    };
  },

  drawVolumeTrend(canvasId, daysData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const width = canvas.parentElement.clientWidth || 340;
    const height = 150;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (!daysData || daysData.length === 0) return;

    const paddingLeft = 40;
    const paddingBottom = 26;
    const paddingTop = 18;
    const paddingRight = 14;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const maxVol = Math.max(...daysData.map(d => d.volume || 0), 1500) * 1.25;

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

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw dots & sampled labels
    daysData.forEach((day, index) => {
      const x = paddingLeft + index * step;
      const y = paddingTop + chartHeight * (1 - (day.volume || 0) / maxVol);

      if (day.volume > 0 || totalDays <= 7) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
      }

      const isSampled = (index % sampleStep === 0) || (index === totalDays - 1);
      if (isSampled) {
        ctx.fillStyle = '#71717a';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(day.label || day.date.slice(5), x, height - 6);
      }
    });

    // Attach click handler for interactive day retrospective
    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX >= paddingLeft && clickX <= width - paddingRight) {
        const clickedIdx = Math.round((clickX - paddingLeft) / step);
        if (daysData[clickedIdx] && window.app && window.app.openDayRetrospective) {
          window.app.openDayRetrospective(daysData[clickedIdx].date);
        }
      }
    };
  }
};

if (typeof window !== 'undefined') {
  window.ChartEngine = ChartEngine;
}
