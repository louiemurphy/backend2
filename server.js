  const express = require("express");
  const cors = require("cors");
  const mongoose = require("mongoose");
  const multer = require("multer");
  const path = require("path");
  const fs = require("fs");
  require('dotenv').config(); // Load environment variables from .env file
  const moment = require('moment-timezone');
  

  const app = express();
  const PORT = process.env.PORT || 5000;
  const HOST = process.env.HOST || '0.0.0.0';

  // Connect to MongoDB using the connection string from .env
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

  // Ensure the uploads directory exists
  const uploadDir = './uploads';
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }


  app.use(cors({
    origin: ['http://localhost:3000', 'http://193.203.162.228'], // Allowed origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
    credentials: true, // Allow credentials
  }));
  
  
  app.options('*', cors());

  // Middleware to parse JSON request bodies
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  // Serve uploaded files statically from the uploads folder
  app.use('/uploads', express.static('uploads'));

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads'); // Save files in the 'uploads' directory
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}_${file.originalname}`); // Add timestamp to filename
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // Limit to 50MB
    fileFilter: (req, file, cb) => {
      const filetypes = /jpeg|jpg|png|gif|pdf/; // Allowed file types
      const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = filetypes.test(file.mimetype);
  
      if (mimetype && extname) {
        return cb(null, true);
      }
      cb(new Error("File type not supported!"), false);
    }
  });
  

  const requestSchema = new mongoose.Schema({
    referenceNumber: { type: String, required: true },
    timestamp: { type: String, required: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    typeOfClient: String,
    classification: String,
    projectTitle: String,
    philgepsReferenceNumber: String,
    productType: String,
    requestType: String,
    dateNeeded: String,
    specialInstructions: String,
    assignedTo: String,
    referenceNumber: String,
    status: { 
      type: Number, 
      default: 0,
      enum: [0, 1, 2, 3] // 0: Pending, 1: Ongoing, 2: Completed, 3: Canceled
    },
    fileUrl: String,
    fileName: String,
    requesterFileUrl: String,
    requesterFileName: String,
    completedAt: Date,
    canceledAt: Date,
    cancellationReason: String,
    
remarks: {
  type: String,
  trim: true,
  default: ''
},
lastUpdated: {
  type: Date,
  default: Date.now
},
detailedStatus: {
  type: String,
  default: 'pending',
  enum: [
    'pending',
    'ongoing',
    'done-system-sizing',
    'cancelled-survey-request-denied',
    'cancelled-not-our-expertise',
    'done-no-go-supplier-acquisition',
    'done-request-approved',
    'cancelled-double-entry',
    'cancelled-requester-cancelled',
    'done-quotation-submitted',
    'done-technical-docs-turnover',
    'done-suggest-buy-bid-docs',
    'done-proposal-approved',
    'done-proposal-disapproved',
    'done-survey-request-approved',
    'done-unable-evaluate-late-request',
    'done-unable-evaluate-multiple-requests',
    'done-unable-evaluate-insufficient-data',
    'done-go-proceed-bidding',
    'done-no-go-bidding-team-directives',
    'done-no-go-certificate',
    'done-no-go-specifications',
    'done-no-go-short-lead-time',
    'done-no-go-breakeven',
    'done-no-go-profitability',
    'done-no-go-negative-profit',
    'done-go-suggest-negotiate'
  ],
},
    // Add status history to track changes
    statusHistory: [{
      status: String,
      changedAt: { type: Date, default: Date.now },
      changedBy: String // Optional: to track who made the change
    }],
    lastUpdated: { 
      type: Date, 
      default: Date.now,
      required: true // Make this required
    }
    
  }, { 
    timestamps: true,
    // Add middleware to handle status updates
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  });

  

  
  
  // Add pre-save middleware to update lastUpdated and add to status history
  requestSchema.pre('save', function(next) {
    // Update lastUpdated timestamp
    this.lastUpdated = new Date();
    
    // If detailedStatus changed, add to history
    if (this.isModified('detailedStatus')) {
      if (!this.statusHistory) {
        this.statusHistory = [];
      }
      
      this.statusHistory.push({
        status: this.detailedStatus,
        changedAt: new Date(),
        changedBy: this.assignedTo // Or whatever field you use to track the user
      });
    }
    
    next();
  });
  
  // Add methods to help with status management
  requestSchema.methods.updateDetailedStatus = async function(newStatus, updatedBy) {
    this.detailedStatus = newStatus;
    this.lastUpdated = new Date();
    
    // Add to status history
    this.statusHistory.push({
      status: newStatus,
      changedAt: new Date(),
      changedBy: updatedBy
    });
    
    return this.save();
  };
  
  // Static method to find requests by status
  requestSchema.statics.findByDetailedStatus = function(status) {
    return this.find({ detailedStatus: status });
  };
  
  // Virtual for formatted lastUpdated date
  requestSchema.virtual('formattedLastUpdated').get(function() {
    return this.lastUpdated ? moment(this.lastUpdated).format('MM/DD/YYYY, h:mm:ss A') : null;
  });
  
  const Request = mongoose.model('Request', requestSchema);

  const teamMemberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    openTasks: { type: Number, required: true },
    closedTasks: { type: Number, required: true },
    completionRate: { type: Number, required: true },
    profileImage: { type: String }, // New field for storing profile image path
  });

  const TeamMember = mongoose.model('TeamMember', teamMemberSchema);

  // Define the supplier schema
  const supplierSchema = new mongoose.Schema({
    email: { type: String, required: true },
    category: { type: String, required: true },
    classification: { type: String, required: true },
    companyName: { type: String, required: true },
    address: { type: String, required: true },
    location: { type: String, required: true },
    account: { type: String, required: true },
    contactNumber: { type: String, required: true },
    contactEmail: { type: String, required: true },
    website: { type: String, default: '' }, // Default value if website is not provided
    contactPerson: { type: String, required: true }, // New contact person field
    timestamp: { type: Date, default: Date.now }, // Store timestamp as Date
  });

  /// Virtual field to format timestamp to the Philippine timezone
  supplierSchema.virtual('formattedTimestamp').get(function() {
    return moment(this.timestamp).tz('Asia/Manila').format('MM/DD/YYYY, h:mm:ss A');
  });

  // Include virtual fields when converting to JSON
  supplierSchema.set('toJSON', { virtuals: true });

  // Create and export the Supplier model
  const Supplier = mongoose.model('Supplier', supplierSchema);
  module.exports = Supplier;

  // API to get all suppliers
  app.get('/api/suppliers', async (req, res) => {
    try {
      const suppliers = await Supplier.find(); // Fetch all suppliers
      res.json(suppliers); // Send back as JSON
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      res.status(500).json({ message: 'Error fetching suppliers' });
    }
  });

  // API to create a new supplier (POST request)
  app.post('/api/suppliers', async (req, res) => {
    const { email, category, classification, companyName, address, location, account, contactNumber, contactEmail, website, contactPerson } = req.body;

    try {
      // Create a new Supplier document
      const newSupplier = new Supplier({
        email,
        category,
        classification,
        companyName,
        address,
        location,
        account,
        contactNumber,
        contactEmail,
        website,
        contactPerson, // Add the contactPerson to the new supplier
      });

      // Save the new supplier to the database
      const savedSupplier = await newSupplier.save();

      // Return the newly created supplier
      res.status(201).json(savedSupplier); // 201 status for created resources
    } catch (error) {
      console.error('Error creating supplier:', error);
      res.status(500).json({ message: 'Error creating supplier' });
    }
  });



  // API routes

  // Root route to check if the API is running
  app.get("/api", (req, res) => {
    res.json({ message: "API is running" });
  });

  app.put('/api/requests/:id/updateDetailedStatus', async (req, res) => {
    console.log('Incoming detailedStatus:', req.body.detailedStatus);
    console.log('Type of detailedStatus:', typeof req.body.detailedStatus); // Ensure it's a string
  
    try {
      const { detailedStatus, statusRemarks, timestamp } = req.body;
      const request = await Request.findById(req.params.id);
  
      if (!request) {
        return res.status(404).json({ message: 'Request not found' });
      }
  
      if (!Request.schema.path('detailedStatus').enumValues.includes(detailedStatus)) {
        return res.status(400).json({ message: `Invalid detailedStatus: ${detailedStatus}` });
      }
  
      request.statusHistory.push({
        detailedStatus,
        remarks: statusRemarks,
        timestamp: new Date(timestamp),
      });
  
      request.detailedStatus = detailedStatus;
      await request.save();
  
      res.json(request);
    } catch (error) {
      console.error('Error in updating detailedStatus:', error);
      res.status(500).json({ message: error.message });
    }
  });
  


app.put('/api/requests/:id/updateRemarks', async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    // Validate input
    if (remarks === undefined) {
      return res.status(400).json({ message: 'Remarks are required' });
    }

    // Find and update the request
    const updatedRequest = await Request.findByIdAndUpdate(
      id,
      { 
        remarks: remarks.trim(), 
        lastUpdated: new Date() 
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: 'Request not found' });
    }

    res.json(updatedRequest);

  } catch (error) {
    console.error('Error updating remarks:', error);
    res.status(500).json({ message: 'Server error updating remarks' });
  }
});




  // GET all requests or filter by assignedTo
  app.get("/api/requests", async (req, res) => {
    try {
      const { assignedTo } = req.query;
      const filter = assignedTo ? { assignedTo } : {};
      const requests = await Request.find(filter);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching requests:", error);
      res.status(500).json({ message: "Error fetching requests" });
    }
  });


  // Static function to get the next reference number
requestSchema.statics.getNextReferenceNumber = async function () {
  const requestCount = await this.countDocuments(); // Count the total requests
  if (requestCount === 0) {
    return '0001'; // Start from 0001 if no requests exist
  }

  requestSchema.pre('save', async function (next) {
    if (!this.referenceNumber) {
      this.referenceNumber = await this.constructor.getNextReferenceNumber();
    }
    next();
  });
  

  // Find the last request and increment its reference number
  const lastRequest = await this.findOne({}, {}, { sort: { referenceNumber: -1 } });
  if (!lastRequest) return '0001';

  const lastNumber = parseInt(lastRequest.referenceNumber);
  const nextNumber = lastNumber + 1;

  return nextNumber.toString().padStart(4, '0'); // Ensure the number is 4 digits
};


// Counter Schema - keep this at the top level
const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model("Counter", counterSchema);

  
async function getNextSequence(sequenceName) {
  try {
    const counter = await Counter.findOneAndUpdate(
      { name: sequenceName },
      { $inc: { seq: 1 } }, // Increment the sequence by 1
      { new: true, upsert: true } // Create the counter if it doesn't exist
    );

    return counter.seq.toString().padStart(4, "0"); // Return the sequence as a 4-digit number
  } catch (error) {
    console.error("Error getting next sequence:", error);
    throw new Error("Failed to generate reference number");
  }
}




  

  
  
app.post("/api/requests", async (req, res) => {
  try {
    const newReferenceNumber = await getNextSequence("requestCounter");
    
    const newRequest = new Request({
      ...req.body,
      referenceNumber: newReferenceNumber,
      timestamp: new Date().toISOString()
    });

    await newRequest.save();
    res.status(201).json(newRequest);
  } catch (error) {
    console.error("Error creating request:", error);
    res.status(500).json({ message: "Error creating request" });
  }
});
  
async function initializeCounter() {
  try {
    // Check if there are existing requests in the database
    const lastRequest = await Request.findOne({}, {}, { sort: { referenceNumber: -1 } });

    if (lastRequest) {
      // Set the counter to the last reference number if requests exist
      const lastReferenceNumber = parseInt(lastRequest.referenceNumber, 10);
      await Counter.findOneAndUpdate(
        { name: "requestCounter" },
        { seq: lastReferenceNumber },
        { new: true, upsert: true } // Create if it doesn't exist
      );
      console.log("Counter initialized to match last reference number:", lastReferenceNumber);
    } else {
      // No requests exist, reset the counter to 0
      await Counter.findOneAndUpdate(
        { name: "requestCounter" },
        { seq: 0 },
        { new: true, upsert: true }
      );
      console.log("Counter reset to 0 (no requests found).");
    }
  } catch (error) {
    console.error("Error initializing counter:", error);
  }
}



// Call during server startup
initializeCounter();


  
app.delete('/api/requests', async (req, res) => {
  try {
    // Delete all requests
    await Request.deleteMany();

    // Reset the counter to 0
    await Counter.findOneAndUpdate(
      { name: 'requestCounter' },
      { seq: 0 }, // Reset sequence
      { new: true, upsert: true } // Create if it doesn't exist
    );

    res.status(200).json({ message: 'All requests and counter reset successfully' });
  } catch (error) {
    console.error('Error deleting requests and resetting counter:', error);
    res.status(500).json({ error: 'Failed to delete requests or reset counter' });
  }
});



  
app.delete('/api/requests/:id', async (req, res) => {
  try {
    // Delete the specific request
    const deletedRequest = await Request.findByIdAndDelete(req.params.id);
    if (!deletedRequest) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Get all remaining requests sorted by timestamp
    const remainingRequests = await Request.find().sort({ timestamp: 1 });

    // Reassign reference numbers sequentially
    for (let i = 0; i < remainingRequests.length; i++) {
      const newRefNumber = (i + 1).toString().padStart(4, '0');
      await Request.findByIdAndUpdate(remainingRequests[i]._id, {
        referenceNumber: newRefNumber,
      });
    }

    // Update the Counter to reflect the current number of requests
    await Counter.findOneAndUpdate(
      { name: 'requestCounter' },
      { seq: remainingRequests.length },
      { new: true }
    );

    res.json({ message: 'Request deleted and reference numbers updated successfully' });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({ message: 'Error deleting request' });
  }
});




  // PUT request to update an existing request
  app.put("/api/requests/:id", async (req, res) => {
    try {
      const requestId = req.params.id;
      const { status, completedAt, assignedTo, cancellationReason } = req.body; // Get status, completedAt, assignedTo, and cancellationReason

      // Prepare the update data
      const updateData = { status, assignedTo };

      // If the status is marked as "Completed", store the completedAt field
      if (status === 2 && completedAt) {
        updateData.completedAt = completedAt;
      }

      // If the request is being canceled (status 3), store the canceledAt field and cancellation reason
      if (status === 3) {
        updateData.canceledAt = new Date().toISOString();
        updateData.cancellationReason = cancellationReason || ''; // Optional: Record the cancellation reason
      }

      const updatedRequest = await Request.findByIdAndUpdate(requestId, updateData, { new: true });

      if (!updatedRequest) {
        return res.status(404).json({ message: "Request not found" });
      }

      res.json(updatedRequest);
    } catch (error) {
      console.error("Error updating request:", error);
      res.status(500).json({ message: "Error updating request" });
    }
  });

  app.post("/api/reset-counter", async (req, res) => {
    try {
      await Counter.findOneAndUpdate(
        { name: "requestCounter" },
        { seq: 0 },
        { new: true }
      );
      res.json({ message: "Counter reset successfully" });
    } catch (error) {
      console.error("Error resetting counter:", error);
      res.status(500).json({ message: "Error resetting counter" });
    }
  });

// Delete request endpoint with counter maintenance
app.delete("/api/requests/:id", async (req, res) => {
  try {
    const deletedRequest = await Request.findByIdAndDelete(req.params.id);
    if (!deletedRequest) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Get all remaining requests sorted by timestamp
    const remainingRequests = await Request.find().sort({ timestamp: 1 });
    
    // Update reference numbers for remaining requests
    for (let i = 0; i < remainingRequests.length; i++) {
      const newRefNumber = (i + 1).toString().padStart(4, "0");
      await Request.findByIdAndUpdate(remainingRequests[i]._id, {
        referenceNumber: newRefNumber
      });
    }

    // Update counter to match the number of remaining requests
    await Counter.findOneAndUpdate(
      { name: "requestCounter" },
      { seq: remainingRequests.length },
      { new: true }
    );

    res.json({ message: "Request deleted and sequences updated successfully" });
  } catch (error) {
    console.error("Error deleting request:", error);
    res.status(500).json({ message: "Error deleting request" });
  }
});

// Make sure to call initializeCounter when your server starts
initializeCounter();


  // GET all team members
  app.get("/api/teamMembers", async (req, res) => {
    try {
      const teamMembers = await TeamMember.find(); // Fetch all team members from the database
      res.json(teamMembers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Error fetching team members" });
    }
  });

  app.get("/api/teamMembers/stats", async (req, res) => {
    const { evaluatorId, month, year } = req.query; // Get the evaluatorId, month, and year from query params

    try {
      // Fetch all requests, potentially filtered by month and year
      let query = {};

      // If month and year are provided, filter requests by date
      if (month && year) {
        const startDate = new Date(year, month - 1, 1); // First day of the selected month
        const endDate = new Date(year, month, 0); // Last day of the selected month
        query.date = { $gte: startDate, $lte: endDate }; // Filter by date range
      }

      const requests = await Request.find(query); // Apply date filter if available

      // Create a map to hold the task stats for the specified team member
      const memberStats = {};

      requests.forEach((request) => {
        const assignedMember = request.assignedTo;
        if (assignedMember) {
          // If we're filtering by evaluatorId, only process that member
          if (evaluatorId && assignedMember !== evaluatorId) {
            return; // Skip this request if it doesn't match the evaluatorId
          }

          if (!memberStats[assignedMember]) {
            memberStats[assignedMember] = {
              openTasks: 0,
              closedTasks: 0,
              canceledTasks: 0,
              tasks: []  // Initialize tasks array for each member
            };
          }

          // Increment open, closed, or canceled tasks based on the request status
          if (request.status === 1) {
            memberStats[assignedMember].openTasks += 1; // Ongoing tasks
          } else if (request.status === 2) {
            memberStats[assignedMember].closedTasks += 1; // Completed tasks
          } else if (request.status === 3) {
            memberStats[assignedMember].canceledTasks += 1; // Canceled tasks
          }

          // Add task to the tasks array for this member
          memberStats[assignedMember].tasks.push(request);
        }
      });

      // Helper function to calculate completion rate
      const calculateCompletionRate = (stats) => {
        const totalTasks = stats?.openTasks + stats?.closedTasks + stats?.canceledTasks;
        return totalTasks > 0 ? Math.round((stats?.closedTasks / totalTasks) * 100) : 0;
      };

      // Helper function to calculate efficiency rate
      const calculateEfficiencyRate = (tasks) => {
        if (!tasks || tasks.length === 0) return '0.00'; // Return '0.00' if no tasks are present

        const total = tasks.length; // Total number of tasks

        // Filter tasks where dateCompleted is not null and is on time (i.e., completed before or on dateNeeded)
        const timelyClosedTasks = tasks.filter(task => {
          const dateNeeded = task?.dateNeeded ? new Date(task.dateNeeded) : null;
          const dateCompleted = task?.dateCompleted ? new Date(task.dateCompleted) : null;

          return dateNeeded && dateCompleted && dateCompleted <= dateNeeded;
        }).length;

        // If there are no tasks to calculate, return '0.00'
        if (total === 0) return '0.00';

        // Calculate the efficiency rate and return it as a fixed decimal value
        const efficiencyRate = ((timelyClosedTasks / total) * 100).toFixed(2);
        return efficiencyRate;
      };

      // Prepare response based on evaluatorId filter
      const response = evaluatorId
        ? // If evaluatorId is provided, return stats for that evaluator
          [{
            name: evaluatorId,
            openTasks: memberStats[evaluatorId]?.openTasks || 0,
            closedTasks: memberStats[evaluatorId]?.closedTasks || 0,
            canceledTasks: memberStats[evaluatorId]?.canceledTasks || 0,
            tasks: memberStats[evaluatorId]?.tasks || [],
            completionRate: calculateCompletionRate(memberStats[evaluatorId]),
            efficiencyRate: calculateEfficiencyRate(memberStats[evaluatorId]?.tasks || []),
          }]
        : // If no evaluatorId is provided, return stats for all evaluators
          Object.keys(memberStats).map(name => ({
            name,
            openTasks: memberStats[name]?.openTasks || 0,
            closedTasks: memberStats[name]?.closedTasks || 0,
            canceledTasks: memberStats[name]?.canceledTasks || 0,
            tasks: memberStats[name]?.tasks || [],
            completionRate: calculateCompletionRate(memberStats[name]),
            efficiencyRate: calculateEfficiencyRate(memberStats[name]?.tasks || []),
          }));

      // If no stats are found for the specific evaluator, return default response
      if (evaluatorId && !memberStats[evaluatorId]) {
        return res.json([{
          name: evaluatorId,
          openTasks: 0,
          closedTasks: 0,
          canceledTasks: 0,
          completionRate: 0,
          efficiencyRate: 0,
        }]);
      }

      // Return the response with stats
      res.json(response);
    } catch (error) {
      console.error("Error fetching team member stats:", error);
      res.status(500).json({ message: "Error fetching team member stats" });
    }
  });
  // File upload route for evaluator
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      console.log('No file received');
      return res.status(400).json({ message: "No file uploaded" });
    }

    console.log('File received:', req.file);
    const filePath = `/uploads/${req.file.filename}`;

    try {
      const requestId = req.body.requestId;

      // Update the request with file path and file name for evaluator
      const updatedRequest = await Request.findByIdAndUpdate(
        requestId,
        { 
          fileUrl: filePath,
          fileName: req.file.originalname 
        },
        { new: true }
      );
      
      if (!updatedRequest) {
        console.log('Request not found');
        return res.status(404).json({ message: "Request not found" });
      }

      res.json(updatedRequest);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Error uploading file" });
    }
  });

  // New File upload route for requester
  app.post('/api/requester/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
  
    const filePath = `/uploads/${req.file.filename}`;
  
    try {
      const requestId = req.body.requestId;
  
      const updatedRequest = await Request.findByIdAndUpdate(
        requestId,
        { 
          requesterFileUrl: filePath,
          requesterFileName: req.file.originalname 
        },
        { new: true }
      );
  
      if (!updatedRequest) {
        return res.status(404).json({ message: "Request not found" });
      }
  
      res.set('Access-Control-Allow-Origin', '*'); // Ensure CORS headers
      res.json(updatedRequest);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Error uploading file" });
    }
  });
  
  // File download route
  app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);

    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        return res.status(404).json({ message: 'File not found' });
      }

      res.download(filePath, filename, (downloadError) => {
        if (downloadError) {
          console.error('Error downloading file:', downloadError);
          res.status(500).json({ message: 'Error downloading file' });
        }
      });
    });
  });

  app.post('/api/requests', async (req, res) => {
    try {
      const newReferenceNumber = await getNextSequence('requestCounter');
  
      const newRequest = new Request({
        ...req.body,
        referenceNumber: newReferenceNumber,
        timestamp: new Date().toISOString(),
      });
  
      await newRequest.save();
  
      res.status(201).json(newRequest);
    } catch (error) {
      console.error('Error creating request:', error);
      res.status(500).json({ message: 'Error creating request' });
    }
  });
  

  // New route to handle profile picture upload
  app.post('/api/uploadProfile', upload.single('profileImage'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No profile image uploaded" });
    }

    const filePath = `/uploads/${req.file.filename}`;
    const evaluatorId = req.body.evaluatorId;

    try {
      // Here you might want to store the `filePath` in a separate model or directly in the TeamMember model
      // Assuming each evaluator profile image is stored in the team member's profile
      await TeamMember.findOneAndUpdate(
        { name: evaluatorId }, // Using evaluatorId to find the team member
        { profileImage: filePath }, // Save the new profile image path
        { new: true, upsert: true } // Create if not exists
      );

      res.json({ message: "Profile image uploaded successfully", filePath });
    } catch (error) {
      console.error("Error uploading profile image:", error);
      res.status(500).json({ message: "Error uploading profile image" });
    }
  });
  // GET evaluator/team member details
  app.get('/api/teamMembers/:id', async (req, res) => {
    try {
      const evaluatorId = req.params.id;
      const teamMember = await TeamMember.findOne({ name: evaluatorId });
      
      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

      res.json(teamMember);
    } catch (error) {
      console.error("Error fetching team member details:", error);
      res.status(500).json({ message: "Error fetching team member details" });
    }
  });



  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    initializeCounter(); // Initialize the counter on server startup
});
