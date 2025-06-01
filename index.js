const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);


const app = express();
const port = process.env.PORT || 3000;


// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.v36kmoi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    console.log("token in the middleWare", decoded);
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // collection
    const jobsCollection = client.db("careerCode").collection("jobs");
    const applicationsCollection = client
      .db("careerCode")
      .collection("applications");

    // jobs api
    app.get("/jobs", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.hr_email = email;
      }
      const cursor = jobsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/jobs/applications", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { hr_email: email };
      const jobs = await jobsCollection.find(query).toArray();

      for (const job of jobs) {
        const applicationQuery = { jobId: job._id.toString() };
        const application_Count = await applicationsCollection.countDocuments(
          applicationQuery
        );
        job.application_count = application_Count;
      }
      res.send(jobs);
    });

    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result);
    });

    app.post("/jobs", async (req, res) => {
      const newJob = req.body;
      const result = await jobsCollection.insertOne(newJob);
      res.send(result);
    });

    // applications api

    app.get("/applications", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = {
        applicant: email,
      };
      const result = await applicationsCollection.find(query).toArray();

      // bad way to aggregate data
      for (const application of result) {
        const jobId = application.jobId;
        const jobQuery = { _id: new ObjectId(jobId) };
        const job = await jobsCollection.findOne(jobQuery);
        application.company = job.Company;
        application.title = job.title;
        application.company_logo = job.company_logo;
      }

      res.send(result);
    });

    app.get("/applications/job/:job_id", async (req, res) => {
      const job_id = req.params.job_id;
      const query = {
        jobId: job_id,
      };
      const result = await applicationsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/applications", async (req, res) => {
      const application = req.body;
      const result = await applicationsCollection.insertOne(application);
      res.send(result);
    });

    app.patch("/applications/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const UpdatedDoc = {
        $set: {
          status: req.body.status,
        },
      };
      const result = await applicationsCollection.updateOne(filter, UpdatedDoc);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Career Code is Ready");
});

app.listen(port, () => {
  console.log(`Career Code server on port ${port}`);
});
