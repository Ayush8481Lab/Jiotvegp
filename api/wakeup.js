// api/wakeup.js

// Tell Vercel to use the Edge Runtime so we can use background tasks
export const config = {
    runtime: 'edge', 
};

export default async function handler(req, context) {
    const renderUrl = "https://renderprojectayush.onrender.com/";

    // 1. Create the background task (Fetch the Render URL)
    const wakeUpTask = fetch(renderUrl, { method: 'GET' })
        .then(res => console.log("Render responded with status:", res.status))
        .catch(err => console.error("Failed to reach Render:", err));

    // 2. Tell Vercel NOT to kill the function after we send the response.
    // It will keep the background fetch running.
    context.waitUntil(wakeUpTask);

    // 3. INSTANTLY return a JSON response to cron-job.org (takes milliseconds)
    return new Response(
        JSON.stringify({ 
            success: true, 
            message: "Wake-up signal sent. Render is waking up in the background." 
        }),
        {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }
    );
}
