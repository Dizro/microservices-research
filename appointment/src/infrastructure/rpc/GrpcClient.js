const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const Opossum = require('opossum');
const IPaymentGateway = require('../../ports/out/IPaymentGateway');

class GrpcClient extends IPaymentGateway {
    constructor() {
        super();
        const proto = grpc.loadPackageDefinition(protoLoader.loadSync('payment.proto')).payment;
        this.client = new proto.PaymentService('payment:50051', grpc.credentials.createInsecure());

        this.breaker = new Opossum((id) => new Promise((resolve, reject) => {
            this.client.CheckPaymentStatus({ appointmentId: id }, (err, res) => err ? reject(err) : resolve(res.status));
        }), { timeout: 3000, errorThresholdPercentage: 50, resetTimeout: 10000 });

        this.breaker.fallback(() => 'FALLBACK_PROCESSING');
    }

    async checkStatus(id) {
        return await this.breaker.fire(id);
    }
}

module.exports = GrpcClient;