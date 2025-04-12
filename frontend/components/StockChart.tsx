import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Chart, TooltipItem } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface StockChartProps {
  ticker: string;
  date: string; // Format: "MM/DD/YY"
}

interface StockData {
  timestamps: string[];
  prices: number[];
  pct_changes: number[];
  summary_stats: {
    first_day: {
      min: number;
      max: number;
      change: number;
      pct_change: number;
    };
    second_day: {
      min: number;
      max: number;
      change: number;
      pct_change: number;
    };
    overall: {
      change: number;
      pct_change: number;
    };
  };
  ticker: string;
  start_date: string;
  end_date: string;
}

const formatDateTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const StockChart: React.FC<StockChartProps> = ({ ticker, date }) => {
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStockData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/stock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ticker, date }),
        });

        const data = await response.json();
        if (data.error) {
          setError(data.error);
        } else {
          setStockData(data);
        }
      } catch {
        setError('Failed to fetch stock data');
      } finally {
        setLoading(false);
      }
    };

    fetchStockData();
  }, [ticker, date]);

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading stock data...</div>;
  }

  if (error) {
    return <div className="flex justify-center items-center h-64 text-red-500">{error}</div>;
  }

  if (!stockData) {
    return <div className="flex justify-center items-center h-64">No stock data available</div>;
  }

  const chartData = {
    labels: stockData.timestamps.map(formatDateTime),
    datasets: [
      {
        label: 'Stock Price',
        data: stockData.prices,
        borderColor: 'rgba(128, 209, 141, 255)',
        tension: 0.1,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointBackgroundColor: 'rgba(128, 209, 141, 0.2)',
        pointBorderColor: 'rgba(128, 209, 141, 0.2)',
        pointHoverBackgroundColor: 'rgba(128, 209, 141, 255)',
        pointHoverBorderColor: 'rgba(128, 209, 141, 255)',
        showLine: true,
      },
    ],
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
        borderColor: 'rgba(128, 209, 141, 0.2)',
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: function(context: TooltipItem<'line'>) {
            return `$${context.parsed.y.toFixed(2)}`;
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
          callback: function(tickValue: string | number) {
            const value = typeof tickValue === 'string' ? parseFloat(tickValue) : tickValue;
            return `$${value.toFixed(2)}`;
          }
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
        ctx.strokeStyle = 'rgba(128, 209, 141, 0.5)';
        ctx.stroke();
        ctx.restore();
      }
    },
  };

  ChartJS.register(verticalLinePlugin);

  return (
    <div className="flex flex-col w-full h-full box-border p-6">
      <div className="w-full h-full">
        <Line data={chartData} options={options} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="p-4 border border-white/25 rounded-lg">
          <h3 className="font-bold mb-2">First Day</h3>
          <p>Range: ${stockData.summary_stats.first_day.min.toFixed(2)} - ${stockData.summary_stats.first_day.max.toFixed(2)}</p>
          <p>Change: ${stockData.summary_stats.first_day.change.toFixed(2)} ({stockData.summary_stats.first_day.pct_change.toFixed(2)}%)</p>
        </div>
        <div className="p-4 border border-white/25 rounded-lg">
          <h3 className="font-bold mb-2">Second Day</h3>
          <p>Range: ${stockData.summary_stats.second_day.min.toFixed(2)} - ${stockData.summary_stats.second_day.max.toFixed(2)}</p>
          <p>Change: ${stockData.summary_stats.second_day.change.toFixed(2)} ({stockData.summary_stats.second_day.pct_change.toFixed(2)}%)</p>
        </div>
        <div className="p-4 border border-white/25 rounded-lg">
          <h3 className="font-bold mb-2">Overall</h3>
          <p>Total Change: ${stockData.summary_stats.overall.change.toFixed(2)}</p>
          <p>Percentage: {stockData.summary_stats.overall.pct_change.toFixed(2)}%</p>
        </div>
      </div>
    </div>
  );
};

export default StockChart;