const ShortenedUrl = require('../models/test');

exports.cronInternalApi = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }
  console.log('Cron job triggered');

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Compare only by date, not time

    // Step 1: Update the expired links
    const result = await ShortenedUrl.updateMany(
      {
        expirationDate: { $lte: today },
        active: 'Y',
      },
      {
        $set: { active: 'D' },
      }
    );

    // Step 2: Find the updated documents
    const updatedLinks = await ShortenedUrl.find({
      expirationDate: { $lte: today },
      active: 'D',
    });

    // Log the updated documents
    console.log('Updated Records:', updatedLinks);

    return res.status(200).json({
      message: 'Expired URLs updated successfully',
      matchedCount: result.matchedCount || result.n,
      modifiedCount: result.modifiedCount || result.nModified,
      updatedLinks,  // Send the updated documents in the response
    });
  } catch (error) {
    return res.status(500).json({ error: 'Something went wrong', details: error.message });
  }
};
