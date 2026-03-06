import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button, Loading } from "src/components";
import { useSetWireguardServer, useWireguardServer } from "src/hooks";
import { T } from "src/locale";
import { validateNumber, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showWireguardServerModal = (id: number | "new") => {
	EasyModal.show(WireguardServerModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}

const WireguardServerModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useWireguardServer(id);
	const { mutate: setServer } = useSetWireguardServer();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = {
			id: id === "new" ? undefined : id,
			...values,
		};

		setServer(payload, {
			onError: (err: any) => setErrorMsg(err.message),
			onSuccess: () => {
				showObjectSuccess("wireguard-server", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Modal show={visible} onHide={remove} size="lg">
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">{error.message}</Alert>
			)}
			{isLoading && <Loading noLogo />}
			{!isLoading && data && (
				<Formik
					initialValues={{
						name: data.name || "",
						address: data.address || "10.8.0.1/24",
						listenPort: data.listenPort || 51820,
						dns: data.dns || "1.1.1.1, 1.0.0.1",
						mtu: data.mtu || 1420,
						postUp: data.postUp || "",
						postDown: data.postDown || "",
						endpoint: data.endpoint || "",
					}}
					onSubmit={onSubmit}
				>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data.id ? "object.edit" : "object.add"} tData={{ object: "wireguard-server" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body>
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>

								<Field name="name" validate={validateString(1, 255)}>
									{({ field, form }: any) => (
										<div className="mb-3">
											<label className="form-label" htmlFor="wg-name">
												<T id="column.name" />
											</label>
											<input id="wg-name" type="text" className={`form-control ${form.errors.name && form.touched.name ? "is-invalid" : ""}`} placeholder="e.g. My VPN" required {...field} />
											{form.errors.name && form.touched.name && <div className="invalid-feedback">{form.errors.name}</div>}
										</div>
									)}
								</Field>

								<div className="row">
									<div className="col-md-6">
										<Field name="address" validate={validateString(1, 255)}>
											{({ field, form }: any) => (
												<div className="mb-3">
													<label className="form-label" htmlFor="wg-address">
														<T id="wireguard.address" />
													</label>
													<input id="wg-address" type="text" className={`form-control ${form.errors.address && form.touched.address ? "is-invalid" : ""}`} placeholder="10.8.0.1/24" required {...field} />
												</div>
											)}
										</Field>
									</div>
									<div className="col-md-6">
										<Field name="listenPort" validate={validateNumber(1, 65535)}>
											{({ field, form }: any) => (
												<div className="mb-3">
													<label className="form-label" htmlFor="wg-port">
														<T id="wireguard.listen-port" />
													</label>
													<input id="wg-port" type="number" min={1} max={65535} className={`form-control ${form.errors.listenPort && form.touched.listenPort ? "is-invalid" : ""}`} required {...field} />
												</div>
											)}
										</Field>
									</div>
								</div>

								<div className="row">
									<div className="col-md-8">
										<Field name="endpoint" validate={validateString(0, 255)}>
											{({ field }: any) => (
												<div className="mb-3">
													<label className="form-label" htmlFor="wg-endpoint">
														<T id="wireguard.endpoint" />
													</label>
													<input id="wg-endpoint" type="text" className="form-control" placeholder="vpn.example.com or public IP" {...field} />
													<small className="form-hint"><T id="wireguard.endpoint.hint" /></small>
												</div>
											)}
										</Field>
									</div>
									<div className="col-md-4">
										<Field name="mtu" validate={validateNumber(1280, 1500)}>
											{({ field }: any) => (
												<div className="mb-3">
													<label className="form-label" htmlFor="wg-mtu">MTU</label>
													<input id="wg-mtu" type="number" min={1280} max={1500} className="form-control" {...field} />
												</div>
											)}
										</Field>
									</div>
								</div>

								<Field name="dns" validate={validateString(0, 255)}>
									{({ field }: any) => (
										<div className="mb-3">
											<label className="form-label" htmlFor="wg-dns">DNS</label>
											<input id="wg-dns" type="text" className="form-control" placeholder="1.1.1.1, 1.0.0.1" {...field} />
										</div>
									)}
								</Field>

								<Field name="postUp">
									{({ field }: any) => (
										<div className="mb-3">
											<label className="form-label" htmlFor="wg-postup">PostUp</label>
											<textarea id="wg-postup" className="form-control" rows={2} {...field} />
										</div>
									)}
								</Field>

								<Field name="postDown">
									{({ field }: any) => (
										<div className="mb-3">
											<label className="form-label" htmlFor="wg-postdown">PostDown</label>
											<textarea id="wg-postdown" className="form-control" rows={2} {...field} />
										</div>
									)}
								</Field>
							</Modal.Body>
							<Modal.Footer>
								<Button onClick={remove} disabled={isSubmitting}><T id="cancel" /></Button>
								<Button type="submit" actionType="primary" className="ms-auto" isLoading={isSubmitting} disabled={isSubmitting}>
									<T id="save" />
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
});

export { showWireguardServerModal };
