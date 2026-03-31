const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const cors = require('cors');
const axios = require('axios');

const app = express();
const APPT_URL = 'http://appointment:3003';
const DOC_URL = 'http://doctors:3002';

const typeDefs = `
  type Doctor { _id: ID! name: String specialization: String price: Float schedule: [String] }
  type Appointment { id: ID! patientId: String doctorId: String doctor: Doctor timeSlot: String price: Float status: String }
  type Query { appointmentsByUser(userId: ID!): [Appointment] }
`;

const resolvers = {
  Query: {
    appointmentsByUser: async (_, { userId }) => {
      try {
        const { data } = await axios.get(`${APPT_URL}/appointments/user/${userId}`);
        return await Promise.all(data.map(async (appt) => {
          try {
            const { data: doc } = await axios.get(`${DOC_URL}/doctors/${appt.doctorId}`);
            appt.doctor = doc;
          } catch (e) { appt.doctor = null; }
          return appt;
        }));
      } catch (e) { return []; }
    }
  }
};

(async () => {
  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  app.use('/graphql', cors(), express.json(), expressMiddleware(server));
  app.listen(4000, () => console.log('GraphQL Gateway (4000)'));
})();