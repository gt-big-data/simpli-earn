import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Chart, TooltipItem } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface EconomicIndicatorsChartProps {
  startLocal: string; // Format: "MM/DD/YY HH:MM" or "YYYY-MM-DD HH:MM"
  hours?: number;
  interval?: string;
}

interface IndicatorData {
  timestamps: string[];
  values: number[];
  min?: number;
  max?: number;
  mean?: number;
  error?: string;
}

interface IndicatorsResponse {
  ok: boolean;
  data: {
    VIX?: IndicatorData;
    TNX?: IndicatorData;
    DXY?: IndicatorData;
  };
  error?: string;
  meta?: {
    start_local: string;
    hours: number;
    interval: string;
    indicators: string[];
  };
}

const INDICATOR_NAMES: Record<string, string> = {
  VIX: "VIX (Volatility Index)",
  TNX: "10-Year Treasury Yield",
  DXY: "US Dollar Index"
};

const INDICATOR_COLORS: Record<string, string> = {
  VIX: 'rgba(239, 68, 68, 255)', // Red
  TNX: 'rgba(59, 130, 246, 255)', // Blue
  DXY: 'rgba(245, 158, 11, 255)'  // Orange
};

const formatDateTime = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return timestamp;
  }
};

const EconomicIndicatorsChart: React.FC<EconomicIndicatorsChartProps> = ({ 
  startLocal, 
  hours = 48,
  interval = "5m"
}) => {
  const [indicatorsData, setIndicatorsData] = useState<IndicatorsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndicator, setActiveIndicator] = useState<string>("VIX");

  useEffect(() => {
    const fetchIndicatorsData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/indicators', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            startLocal,
            hours,
            interval,
            indicators: ["VIX", "TNX", "DXY"]
          }),
        });

        const data = await response.json();
        if (!data.ok || data.error) {
          setError(data.error || 'Failed to fetch indicator data');
        } else {
          setIndicatorsData(data);
          // Set default active indicator to first available
          if (data.data) {
            const availableIndicators = Object.keys(data.data).filter(key => 
              data.data[key] && !data.data[key].error && data.data[key].values.length > 0
            );
            if (availableIndicators.length > 0) {
              setActiveIndicator(availableIndicators[0]);
            }
          }
        }
      } catch (err) {
        setError('Failed to fetch indicator data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchIndicatorsData();
  }, [startLocal, hours, interval]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-white/70">
        Loading economic indicators...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64 text-red-500">
        {error}
      </div>
    );
  }

  if (!indicatorsData || !indicatorsData.data) {
    return (
      <div className="flex justify-center items-center h-64 text-white/70">
        No indicator data available
      </div>
    );
  }

  // Get available indicators
  const availableIndicators = Object.keys(indicatorsData.data).filter(key => {
    const indicator = indicatorsData.data[key as keyof typeof indicatorsData.data];
    return indicator && !indicator.error && indicator.values.length > 0;
  });

  if (availableIndicators.length === 0) {
    return (
      <div className="flex justify-center items-center h-64 text-white/70">
        No valid indicator data available for the selected time period
      </div>
    );
  }

  // Ensure active indicator is valid
  const currentIndicator = availableIndicators.includes(activeIndicator) 
    ? activeIndicator 
    : availableIndicators[0];
  
  const currentData = indicatorsData.data[currentIndicator as keyof typeof indicatorsData.data] as IndicatorData;

  if (!currentData || !currentData.timestamps || currentData.timestamps.length === 0) {
    return (
      <div className="flex justify-center items-center h-64 text-white/70">
        No data available for {INDICATOR_NAMES[currentIndicator] || currentIndicator}
      </div>
    );
  }

  const chartData = {
    labels: currentData.timestamps.map(formatDateTime),
    datasets: [
      {
        label: INDICATOR_NAMES[currentIndicator] || currentIndicator,
        data: currentData.values,
        borderColor: INDICATOR_COLORS[currentIndicator] || 'rgba(128, 209, 141, 255)',
        backgroundColor: `${INDICATOR_COLORS[currentIndicator] || 'rgba(128, 209, 141, 255)'}20`,
        tension: 0.1,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointBackgroundColor: `${INDICATOR_COLORS[currentIndicator] || 'rgba(128, 209, 141, 255)'}40`,
        pointBorderColor: INDICATOR_COLORS[currentIndicator] || 'rgba(128, 209, 141, 255)',
        pointHoverBackgroundColor: INDICATOR_COLORS[currentIndicator] || 'rgba(128, 209, 141, 255)',
        pointHoverBorderColor: INDICATOR_COLORS[currentIndicator] || 'rgba(128, 209, 141, 255)',
        fill: false,
      },
    ],
  };

  const formatYAxisLabel = (value: string | number): string => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    // Different formatting based on indicator
    if (currentIndicator === 'VIX') {
      return numValue.toFixed(1);
    } else if (currentIndicator === 'TNX') {
      return `${numValue.toFixed(2)}%`;
    } else if (currentIndicator === 'DXY') {
      return numValue.toFixed(2);
    }
    return numValue.toFixed(2);
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'rgba(255, 255, 255, 0.9)',
        bodyColor: 'rgba(255, 255, 255, 0.9)',
        borderColor: INDICATOR_COLORS[currentIndicator] || 'rgba(128, 209, 141, 0.2)',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: function(context: TooltipItem<'line'>) {
            return `${INDICATOR_NAMES[currentIndicator] || currentIndicator}: ${formatYAxisLabel(context.parsed.y)}`;
          }
        }
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
          drawBorder: false,
        },
        ticks: {
          maxTicksLimit: 6,
          color: 'rgba(255, 255, 255, 0.5)',
          font: {
            size: 10,
          },
        },
      },
      y: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
          drawBorder: false,
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          font: {
            size: 10,
          },
          callback: formatYAxisLabel,
        },
      },
    },
  };

  // Custom plugin for vertical line
  const verticalLinePlugin = {
    id: 'verticalLine',
    afterDraw: (chart: Chart) => {
      const tooltipModel = chart.tooltip;
      
      if (!tooltipModel || !tooltipModel.opacity) {
        return;
      }
      
      const activeElements = tooltipModel.dataPoints || [];
      
      if (activeElements.length > 0) {
        const ctx = chart.ctx;
        const activePoint = activeElements[0];
        const x = activePoint.element.x;
        const topY = chart.scales.y.top;
        const bottomY = chart.scales.y.bottom;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.lineWidth = 1;
        ctx.strokeStyle = `${INDICATOR_COLORS[currentIndicator] || 'rgba(128, 209, 141, 255)'}80`;
        ctx.stroke();
        ctx.restore();
      }
    },
  };

  ChartJS.register(verticalLinePlugin);

  return (
    <div className="flex flex-col w-full h-full box-border p-6">
      {/* Indicator Selector Buttons */}
      <div className="flex gap-2 mb-4">
        {availableIndicators.map((indicator) => (
          <button
            key={indicator}
            onClick={() => setActiveIndicator(indicator)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeIndicator === indicator
                ? 'bg-white/20 text-white border border-white/40'
                : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
            }`}
          >
            {INDICATOR_NAMES[indicator] || indicator}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="w-full flex-1 min-h-0">
        <Line data={chartData} options={options} />
      </div>

      {/* Summary Stats */}
      {currentData.min !== undefined && currentData.max !== undefined && (
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div className="p-4 border border-white/25 rounded-lg">
            <h3 className="font-bold mb-2">Range</h3>
            <p>Min: {formatYAxisLabel(currentData.min)}</p>
            <p>Max: {formatYAxisLabel(currentData.max)}</p>
          </div>
          <div className="p-4 border border-white/25 rounded-lg">
            <h3 className="font-bold mb-2">Change</h3>
            <p>
              {formatYAxisLabel(currentData.values[currentData.values.length - 1])} - 
              {" "}{formatYAxisLabel(currentData.values[0])}
            </p>
            {currentData.values.length > 1 && (
              <p>
                {((currentData.values[currentData.values.length - 1] - currentData.values[0]) / currentData.values[0] * 100).toFixed(2)}%
              </p>
            )}
          </div>
          {currentData.mean !== undefined && (
            <div className="p-4 border border-white/25 rounded-lg">
              <h3 className="font-bold mb-2">Average</h3>
              <p>{formatYAxisLabel(currentData.mean)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EconomicIndicatorsChart;

