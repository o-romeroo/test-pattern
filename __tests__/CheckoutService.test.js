import { CheckoutService } from '../src/services/CheckoutService.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';
import { UserMother } from './builders/UserMother.js';
import { Item } from '../src/domain/Item.js';

describe('CheckoutService', () => {
    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    describe('quando o pagamento falha', () => {
        it('deve retornar null e não acionar efeitos colaterais', async () => {
            const carrinho = CarrinhoBuilder.umCarrinho().build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
            const repositoryDummy = { salvar: jest.fn() };
            const emailDummy = { enviarEmail: jest.fn() };
            const checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailDummy);

            const cartaoCreditoFake = { numero: '4111 1111 1111 1111' };
            const pedido = await checkoutService.processarPedido(carrinho, cartaoCreditoFake);

            expect(pedido).toBeNull();
            expect(repositoryDummy.salvar).not.toHaveBeenCalled();
            expect(emailDummy.enviarEmail).not.toHaveBeenCalled();
        });
    });

    describe('quando um cliente padrão finaliza a compra com sucesso', () => {
        it('deve retornar o pedido salvo com o total final sem desconto', async () => {
            const carrinho = CarrinhoBuilder.umCarrinho()
                .comItens([new Item('Livro', 60), new Item('Caderno', 40)])
                .build();
            const totalEsperado = carrinho.calcularTotal();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = {
                salvar: jest.fn().mockImplementation(async pedido => ({ ...pedido, id: 321 }))
            };
            const emailDummy = { enviarEmail: jest.fn().mockResolvedValue() };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailDummy);

            const cartaoCreditoFake = { numero: '5555 5555 5555 5555' };
            const pedidoSalvo = await checkoutService.processarPedido(carrinho, cartaoCreditoFake);

            expect(gatewayStub.cobrar).toHaveBeenCalledWith(totalEsperado, cartaoCreditoFake);
            expect(repositoryStub.salvar).toHaveBeenCalledWith(expect.objectContaining({
                totalFinal: totalEsperado,
                status: 'PROCESSADO'
            }));
            expect(pedidoSalvo.id).toBe(321);
            expect(pedidoSalvo.totalFinal).toBe(totalEsperado);
        });
    });

    describe('quando um cliente padrão finaliza a compra e o e-mail deve ser enviado', () => {
        it('deve enviar o e-mail com os dados corretos', async () => {
            const carrinho = CarrinhoBuilder.umCarrinho()
                .comItens([new Item('Monitor', 300)])
                .build();
            const totalEsperado = carrinho.calcularTotal();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = {
                salvar: jest.fn().mockImplementation(async pedido => ({ ...pedido, id: 654 }))
            };
            const emailMock = { enviarEmail: jest.fn().mockResolvedValue() };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            const cartaoCreditoFake = { numero: '7777 7777 7777 7777' };
            const pedidoSalvo = await checkoutService.processarPedido(carrinho, cartaoCreditoFake);

            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'padrao@email.com',
                'Seu Pedido foi Aprovado!',
                `Pedido 654 no valor de R$${totalEsperado}`
            );
            expect(pedidoSalvo.totalFinal).toBe(totalEsperado);
        });
    });

    describe('quando um cliente Premium finaliza a compra', () => {
        it('deve aplicar desconto, cobrar valor correto e enviar e-mail', async () => {
            const usuarioPremium = UserMother.umUsuarioPremium();
            const carrinho = CarrinhoBuilder.umCarrinho()
                .comUser(usuarioPremium)
                .comItens([new Item('Mouse Gamer', 120), new Item('Teclado Mecânico', 80)])
                .build();
            const totalSemDesconto = carrinho.calcularTotal();
            const totalComDesconto = totalSemDesconto * 0.9;
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = {
                salvar: jest.fn().mockImplementation(async pedido => ({ ...pedido, id: 987 }))
            };
            const emailMock = { enviarEmail: jest.fn().mockResolvedValue() };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            const cartaoCreditoFake = { numero: '8888 8888 8888 8888' };
            const pedidoSalvo = await checkoutService.processarPedido(carrinho, cartaoCreditoFake);

            expect(gatewayStub.cobrar).toHaveBeenCalledWith(totalComDesconto, cartaoCreditoFake);
            expect(repositoryStub.salvar).toHaveBeenCalledWith(expect.objectContaining({
                totalFinal: totalComDesconto
            }));
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'premium@email.com',
                'Seu Pedido foi Aprovado!',
                `Pedido 987 no valor de R$${totalComDesconto}`
            );
            expect(pedidoSalvo.totalFinal).toBe(totalComDesconto);
        });
    });

    describe('quando o carrinho está vazio', () => {
        it('deve processar com total zero e ainda assim persistir e notificar', async () => {
            const carrinho = CarrinhoBuilder.umCarrinho().vazio().build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = {
                salvar: jest.fn().mockImplementation(async pedido => ({ ...pedido, id: 432 }))
            };
            const emailMock = { enviarEmail: jest.fn().mockResolvedValue() };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            const cartaoCreditoFake = { numero: '9999 9999 9999 9999' };
            const pedidoSalvo = await checkoutService.processarPedido(carrinho, cartaoCreditoFake);

            expect(carrinho.calcularTotal()).toBe(0);
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(0, cartaoCreditoFake);
            expect(repositoryStub.salvar).toHaveBeenCalledWith(expect.objectContaining({ totalFinal: 0 }));
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'padrao@email.com',
                'Seu Pedido foi Aprovado!',
                'Pedido 432 no valor de R$0'
            );
            expect(pedidoSalvo.totalFinal).toBe(0);
        });
    });

    describe('quando o envio de e-mail falha', () => {
        it('deve registrar o erro e ainda retornar o pedido salvo', async () => {
            const carrinho = CarrinhoBuilder.umCarrinho().build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = {
                salvar: jest.fn().mockImplementation(async pedido => ({ ...pedido, id: 246 }))
            };
            const emailMock = { enviarEmail: jest.fn().mockRejectedValue(new Error('SMTP down')) };
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            const cartaoCreditoFake = { numero: '1010 1010 1010 1010' };
            const pedidoSalvo = await checkoutService.processarPedido(carrinho, cartaoCreditoFake);

            expect(pedidoSalvo.id).toBe(246);
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(consoleSpy).toHaveBeenCalledWith('Falha ao enviar e-mail', 'SMTP down');
        });
    });
});
