import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { existsSync } from "fs";

/** These routes use Node `spawn`; keep them out of edge/static preflight. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Use project venv Python (has yfinance, matplotlib, etc.)
const venvPython = path.join(process.cwd(), "..", "venv", "bin", "python3");
const pythonPath = existsSync(venvPython) ? venvPython : "python3";

export async function POST(request: Request): Promise<Response> {
  try {
    const { ticker, date } = await request.json();

    // Validate input
    if (!ticker || !date) {
      return NextResponse.json(
        { error: "Missing ticker or date parameter" },
        { status: 400 }
      );
    }

    return new Promise<Response>((resolve) => {
      const pythonProcess = spawn(pythonPath, [
        path.join(process.cwd(), "app/stockchartgenerationV2.py"),
        ticker,
        date,
      ]);

      let stockData = "";
      let errorData = "";

      pythonProcess.stdout.on("data", (data) => {
        stockData += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        errorData += data.toString();
      });

      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          resolve(
            NextResponse.json(
              { error: `Python script error: ${errorData}` },
              { status: 500 }
            )
          );
        } else {
          try {
            // Log the raw output for debugging
            console.log("Raw Python output:", stockData);

            // Try to parse the JSON
            const parsedData = JSON.parse(stockData);
            resolve(NextResponse.json(parsedData));
          } catch (parseError) {
            // Log the parsing error
            console.error("JSON parsing error:", parseError);
            console.error("Raw data that failed to parse:", stockData);

            resolve(
              NextResponse.json(
                {
                  error: "Failed to parse stock data",
                  details:
                    parseError instanceof Error
                      ? parseError.message
                      : "Unknown parsing error",
                  rawOutput: stockData.substring(0, 200) + "...", // Include first 200 chars of raw output
                },
                { status: 500 }
              )
            );
          }
        }
      });
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
