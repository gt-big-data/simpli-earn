import os
import requests
import yfinance as yf
import matplotlib.pyplot as plt
import seaborn as sns
import matplotlib.dates as mdates
from datetime import datetime, timedelta
from dotenv import load_dotenv
import pandas as pd
import numpy as np
import pytz
import json

# Load environment variables from .env file
load_dotenv()
api_key = os.getenv("YOUTUBE_API_KEY")

# Known company → ticker mappings (expandable)
KNOWN_COMPANIES = {
    "TESLA": "TSLA",
    "APPLE": "AAPL",
    "GOOGLE": "GOOGL",
    "ALPHABET": "GOOGL",
    "AMAZON": "AMZN",
    "MICROSOFT": "MSFT",
    "META": "META",
    "FACEBOOK": "META",
    "NETFLIX": "NFLX",
    "NVIDIA": "NVDA",
    "INTEL": "INTC",
    "UBER": "UBER",
    "ADOBE": "ADBE"
}

def extract_video_id(youtube_link):
    """Extract the video ID from a YouTube URL"""
    if "v=" in youtube_link:
        return youtube_link.split("v=")[1].split("&")[0]
    elif "youtu.be/" in youtube_link:
        return youtube_link.split("youtu.be/")[1].split("?")[0]
    elif "youtube.com/live/" in youtube_link:
        return youtube_link.split("youtube.com/live/")[1].split("?")[0]
    else:
        return youtube_link
    
def get_youtube_metadata(video_id):
    """Get upload date and title of a YouTube video"""
    url = f'https://www.googleapis.com/youtube/v3/videos?id={video_id}&part=snippet&key={api_key}'
    response = requests.get(url)
    data = response.json()

    if 'items' in data and len(data['items']) > 0:
        snippet = data['items'][0]['snippet']
        upload_date = snippet['publishedAt']
        title = snippet['title']
        return upload_date, title
    else:
        print(f"Error retrieving metadata: {data.get('error', {}).get('message', 'Unknown error')}")
        return None, None

def guess_ticker_from_title(title):
    """Try to determine stock ticker from video title"""
    title_upper = title.upper()
    for company, ticker in KNOWN_COMPANIES.items():
        if company in title_upper:
            return ticker
    
    print("⚠️ Could not determine ticker from title.")
    return input("Please enter the stock ticker manually: ").upper()

def get_stock_chart(ticker, event_date_str):
    """Generate stock chart data for exactly 48 hours (24 from event day, 24 from next day)"""
    try:
        # Parse the event date
        event_date = datetime.strptime(event_date_str, "%m/%d/%y")
        
        # Set the start of day for event_date and the day after
        day_start = datetime(event_date.year, event_date.month, event_date.day, 0, 0, 0)
        next_day_start = day_start + timedelta(days=1)
        next_day_end = next_day_start + timedelta(days=1)
        
        # Set up time range to ensure we get enough data
        start_time = day_start - timedelta(days=1)  # Add buffer before
        end_time = next_day_end + timedelta(days=1)  # Add buffer after

        # Download stock data - try multiple intervals if needed
        intervals = ["1h", "5m", "15m", "30m", "1d"]
        stock_data = None
        
        for interval in intervals:
            try:
                stock_data = yf.download(
                    ticker,
                    start=start_time,
                    end=end_time,
                    interval=interval,
                    prepost=True,
                    progress=False,
                    threads=True
                )
                if stock_data is not None and not stock_data.empty:
                    break
            except Exception as e:
                continue
        
        if stock_data is None or stock_data.empty:
            # Try one more time with daily data and wider range
            try:
                wider_start = start_time - timedelta(days=7)
                wider_end = end_time + timedelta(days=7)
                stock_data = yf.download(
                    ticker,
                    start=wider_start,
                    end=wider_end,
                    interval="1d",
                    prepost=True,
                    progress=False,
                    threads=True
                )
            except Exception as e:
                return {"error": f"Failed to fetch stock data for {ticker}. Error: {str(e)}"}
        
        if stock_data is None or stock_data.empty:
            return {"error": f"No stock data found for {ticker} in the specified time range. The date might be too far in the future or the market was closed."}

        # Ensure timezone information is present
        eastern_tz = pytz.timezone('US/Eastern')
        if stock_data.index.tz is None:
            stock_data.index = stock_data.index.tz_localize('UTC').tz_convert(eastern_tz)
        else:
            stock_data.index = stock_data.index.tz_convert(eastern_tz)

        # Create a DataFrame with exactly 48 hourly slots for the two days
        hours = []
        for day in [day_start, next_day_start]:
            for hour in range(24):  # 0 to 23 hours for each day
                hours.append(eastern_tz.localize(datetime(day.year, day.month, day.day, hour, 0, 0)))
        
        # Create empty DataFrame with these hours
        perfect_hours_df = pd.DataFrame(index=hours, columns=['Close'])
        perfect_hours_df['Close'] = np.nan
        
        # For each hour in our perfect grid, find the closest data point in the actual stock data
        for hour in hours:
            # Find nearest data point before and after our target hour
            data_before = stock_data[stock_data.index <= hour]
            data_after = stock_data[stock_data.index > hour]
            
            if not data_before.empty:
                # Get the most recent price before this hour
                perfect_hours_df.at[hour, 'Close'] = data_before['Close'].iloc[-1]
            elif not data_after.empty:
                # If no prior data, use the next available price
                perfect_hours_df.at[hour, 'Close'] = data_after['Close'].iloc[0]
                
        # Forward fill any remaining NaN values
        perfect_hours_df.fillna(method='ffill', inplace=True)
        
        # If still have NaNs at the beginning, backfill
        perfect_hours_df.fillna(method='bfill', inplace=True)

        # Calculate percentage changes
        start_price = perfect_hours_df['Close'].iloc[0]
        pct_changes = ((perfect_hours_df['Close'] - start_price) / start_price) * 100

        # Prepare data for JSON response
        timestamps = [t.strftime('%Y-%m-%d %H:%M:%S') for t in perfect_hours_df.index]
        prices = perfect_hours_df['Close'].tolist()
        pct_changes = pct_changes.tolist()

        # Calculate summary statistics
        first_day_data = perfect_hours_df.iloc[:24]
        second_day_data = perfect_hours_df.iloc[24:]

        summary_stats = {
            'first_day': {
                'min': float(first_day_data['Close'].min()),
                'max': float(first_day_data['Close'].max()),
                'change': float(first_day_data['Close'].iloc[-1] - first_day_data['Close'].iloc[0]),
                'pct_change': float((first_day_data['Close'].iloc[-1] - first_day_data['Close'].iloc[0]) / first_day_data['Close'].iloc[0] * 100)
            },
            'second_day': {
                'min': float(second_day_data['Close'].min()),
                'max': float(second_day_data['Close'].max()),
                'change': float(second_day_data['Close'].iloc[-1] - second_day_data['Close'].iloc[0]),
                'pct_change': float((second_day_data['Close'].iloc[-1] - second_day_data['Close'].iloc[0]) / second_day_data['Close'].iloc[0] * 100)
            },
            'overall': {
                'change': float(perfect_hours_df['Close'].iloc[-1] - perfect_hours_df['Close'].iloc[0]),
                'pct_change': float((perfect_hours_df['Close'].iloc[-1] - perfect_hours_df['Close'].iloc[0]) / perfect_hours_df['Close'].iloc[0] * 100)
            }
        }

        return {
            'timestamps': timestamps,
            'prices': prices,
            'pct_changes': pct_changes,
            'summary_stats': summary_stats,
            'ticker': ticker,
            'start_date': day_start.strftime('%Y-%m-%d'),
            'end_date': next_day_end.strftime('%Y-%m-%d')
        }

    except Exception as e:
        return {"error": str(e)}

# Main execution
def main():
    youtube_link = input("Enter YouTube Earnings Call Link: ")
    video_id = extract_video_id(youtube_link)
    
    if not video_id:
        print("❌ Could not extract video ID from the provided link.")
        return
        
    print(f"🔍 Analyzing video ID: {video_id}")
    upload_date, title = get_youtube_metadata(video_id)

    if upload_date and title:
        # Convert UTC time to a more readable format
        upload_datetime = datetime.strptime(upload_date, "%Y-%m-%dT%H:%M:%SZ")
        formatted_date = upload_datetime.strftime("%m/%d/%y")
        
        print(f"\n🎬 YouTube Video: '{title}'")
        print(f"🗓️ Upload Date: {formatted_date} ({upload_datetime.strftime('%Y-%m-%d %H:%M:%S')} UTC)")

        # Detect ticker from title
        ticker = guess_ticker_from_title(title)
        print(f"💹 Detected Ticker: {ticker}")

        # Generate stock chart
        result = get_stock_chart(ticker, formatted_date)
        if 'error' in result:
            print(f"❌ Error: {result['error']}")
        else:
            print(json.dumps(result))
    else:
        print("❌ Error: Could not retrieve YouTube metadata. Check your API key and video link.")

# Modify main function to handle command line arguments
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2:
        ticker = sys.argv[1]
        date = sys.argv[2]
        try:
            result = get_stock_chart(ticker, date)
            print(json.dumps(result))  # goes directly to stdout
        except Exception as e:
            print(json.dumps({"error": str(e)}))
            sys.exit(1)
    else:
        main()
