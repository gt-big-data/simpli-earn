import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export async function POST(request: Request): Promise<Response> {
  try {
    const { startLocal, hours = 48, interval = "5m", indicators } = await request.json();

    // Validate input
    if (!startLocal) {
      return NextResponse.json(
        { ok: false, error: "Missing startLocal parameter" },
        { status: 400 }
      );
    }

    // Date format conversion: handle both "YYYY-MM-DD HH:MM" and "MM/DD/YY HH:MM"
    let formattedDate = startLocal;
    
    // If date is in MM/DD/YY format, convert it to YYYY-MM-DD HH:MM
    if (startLocal.includes("/")) {
      const parts = startLocal.trim().split(" ");
      const datePart = parts[0]; // MM/DD/YY
      const timePart = parts[1] || "09:30"; // HH:MM or default
      
      const [m, d, y] = datePart.split("/");
      const fullYear = parseInt(y) < 50 ? `20${y}` : `19${y}`;
      formattedDate = `${fullYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")} ${timePart}`;
    }
    // If already in YYYY-MM-DD format, use as is

    return new Promise<Response>((resolve) => {
      const args = [
        path.join(process.cwd(), "app/economicIndicatorsV2.py"),
        formattedDate,
        hours.toString(),
        interval,
      ];

      // Add indicators if specified
      if (indicators && Array.isArray(indicators) && indicators.length > 0) {
        args.push(indicators.join(","));
      }

      const pythonProcess = spawn("python3", args);

      let indicatorData = "";
      let errorData = "";

      pythonProcess.stdout.on("data", (data) => {
        indicatorData += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        errorData += data.toString();
      });

      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          resolve(
            NextResponse.json(
              { ok: false, error: `Python script error: ${errorData}` },
              { status: 500 }
            )
          );
        } else {
          try {
            const parsedData = JSON.parse(indicatorData);
            resolve(NextResponse.json(parsedData));
          } catch (parseError) {
            console.error("JSON parsing error:", parseError);
            console.error("Raw data that failed to parse:", indicatorData);

            resolve(
              NextResponse.json(
                {
                  ok: false,
                  error: "Failed to parse indicator data",
                  details:
                    parseError instanceof Error
                      ? parseError.message
                      : "Unknown parsing error",
                  rawOutput: indicatorData.substring(0, 200) + "...",
                },
                { status: 500 }
              )
            );
          }
        }
      });
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}

