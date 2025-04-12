const axios = require('axios');

const cronInternalApi = async () => {
  try {
    const response = await axios.get('https://admin-dashboard-backend-rust.vercel.app/api/v1/cronTrigger', {
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`, // or hardcode
      },
    });

    console.log('Internal Cron Trigger Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error in cronInternalApi:', error.message);
    throw error;
  }
};

exports.CronBasecontroller = async (req, res) => {
  try {
    const result = await cronInternalApi();
    res.status(200).json({
      message: 'Internal cron API called successfully',
      result,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to call internal cron endpoint',
      details: err.message,
    });
  }
};
